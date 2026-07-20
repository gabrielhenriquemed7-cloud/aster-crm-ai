create extension if not exists pgcrypto with schema extensions;
begin;

alter table public.clinical_documents
  add column if not exists snapshot_json jsonb,
  add column if not exists rendered_html text,
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_status text not null default 'pending',
  add column if not exists content_hash text,
  add column if not exists hash_algorithm text,
  add column if not exists hash_generated_at timestamptz,
  add column if not exists template_id text,
  add column if not exists template_version integer,
  add column if not exists renderer_version integer,
  add column if not exists schema_version integer,
  add column if not exists document_version integer not null default 1,
  add column if not exists immutable_at timestamptz,
  add column if not exists supersedes_document_id uuid references public.clinical_documents(id) on delete restrict,
  add column if not exists superseded_by_document_id uuid references public.clinical_documents(id) on delete restrict,
  add column if not exists legacy_migrated_at timestamptz,
  add column if not exists legacy_source text,
  add column if not exists legacy_confidence text;

alter table public.clinical_documents
  drop constraint if exists clinical_documents_pdf_status_check,
  add constraint clinical_documents_pdf_status_check
    check (pdf_status in ('pending', 'available', 'failed', 'not_applicable')),
  drop constraint if exists clinical_documents_hash_algorithm_check,
  add constraint clinical_documents_hash_algorithm_check
    check (hash_algorithm is null or hash_algorithm = 'SHA-256'),
  drop constraint if exists clinical_documents_legacy_confidence_check,
  add constraint clinical_documents_legacy_confidence_check
    check (legacy_confidence is null or legacy_confidence in ('high', 'medium', 'low')),
  drop constraint if exists clinical_documents_distinct_version_links_check,
  add constraint clinical_documents_distinct_version_links_check
    check (
      (supersedes_document_id is null or supersedes_document_id <> id)
      and (superseded_by_document_id is null or superseded_by_document_id <> id)
    );

create unique index if not exists clinical_documents_superseded_by_uidx
  on public.clinical_documents(superseded_by_document_id)
  where superseded_by_document_id is not null;
create index if not exists clinical_documents_supersedes_idx
  on public.clinical_documents(supersedes_document_id)
  where supersedes_document_id is not null;

create table if not exists public.clinical_document_audit_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  document_id uuid not null references public.clinical_documents(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  result text not null default 'success',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists clinical_document_audit_events_document_idx
  on public.clinical_document_audit_events(document_id, created_at desc);
create index if not exists clinical_document_audit_events_clinic_idx
  on public.clinical_document_audit_events(clinic_id, created_at desc);

alter table public.clinical_document_audit_events enable row level security;
drop policy if exists "Clinic members read document audit" on public.clinical_document_audit_events;
create policy "Clinic members read document audit"
  on public.clinical_document_audit_events
  for select to authenticated
  using (public.is_active_clinic_member(clinic_id));
grant select on public.clinical_document_audit_events to authenticated;

create or replace function public.canonical_jsonb_sha256(value jsonb)
returns text
language sql
immutable
strict
set search_path = public, extensions
as $$
  select encode(extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex')
$$;

create or replace function public.escape_official_document_html(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(replace(replace(replace(replace(coalesce(value, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

create or replace function public.render_official_prescription_html(snapshot jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  item jsonb;
  medications_html text := '';
begin
  for item in
    select value from jsonb_array_elements(coalesce(snapshot #> '{prescription,presentation,medications}', '[]'::jsonb))
  loop
    medications_html := medications_html || format(
      '<section><h3>%s</h3><p>%s</p><p>%s</p><p>%s</p></section>',
      public.escape_official_document_html(item ->> 'name'),
      public.escape_official_document_html(item ->> 'formAndPackage'),
      public.escape_official_document_html(item ->> 'posology'),
      public.escape_official_document_html(item ->> 'quantity')
    );
  end loop;

  return format(
    '<article data-aster-document="official" data-schema-version="%s"><header><h1>%s</h1><p>%s</p></header><h2>%s</h2><p>Paciente: %s</p><p>Documento nº %s</p>%s<footer><strong>%s</strong><p>%s</p></footer></article>',
    coalesce(snapshot ->> 'schema_version', '1'),
    public.escape_official_document_html(snapshot #>> '{clinic,name}'),
    public.escape_official_document_html(snapshot #>> '{clinic,address_text}'),
    public.escape_official_document_html(snapshot ->> 'title'),
    public.escape_official_document_html(snapshot #>> '{patient,name}'),
    public.escape_official_document_html(snapshot ->> 'public_number'),
    medications_html,
    public.escape_official_document_html(snapshot #>> '{professional,name}'),
    public.escape_official_document_html(snapshot #>> '{professional,registration_text}')
  );
end
$$;

-- Existing official documents are frozen from the best representation currently
-- available. They remain explicitly marked as legacy and are never presented as
-- a byte-identical copy of an earlier print that was not persisted.
drop trigger if exists clinical_documents_enforce_tenant on public.clinical_documents;

update public.clinical_documents document
set
  snapshot_json = jsonb_build_object(
    'schema_version', 1,
    'origin', 'legacy_current_known',
    'is_legacy', true,
    'title', document.title,
    'document_type', document.document_type,
    'public_number', document.public_number,
    'document_version', coalesce(document.document_version, 1),
    'issued_at', document.issued_at,
    'timezone', 'America/Bahia',
    'identifiers', jsonb_build_object(
      'document_id', document.id,
      'clinic_id', document.clinic_id,
      'patient_id', document.patient_id,
      'appointment_id', document.appointment_id,
      'medical_record_id', document.medical_record_id,
      'professional_id', document.professional_id
    ),
    'prescription', jsonb_build_object(
      'payload', coalesce(document.content -> 'prescription', document.content),
      'items', coalesce((
        select jsonb_agg(to_jsonb(item) - 'clinic_id' - 'document_id' order by item.sort_order)
        from public.prescription_items item
        where item.document_id = document.id
      ), '[]'::jsonb)
    ),
    'legacy', jsonb_build_object(
      'source', case
        when document.pdf_storage_path is not null then 'persisted_pdf'
        when document.rendered_html is not null then 'persisted_html'
        when document.content ? 'prescription' then 'partial_snapshot'
        else 'structured_payload'
      end,
      'confidence', case
        when document.pdf_storage_path is not null then 'high'
        when document.rendered_html is not null then 'medium'
        else 'low'
      end,
      'warning', 'Representação histórica congelada a partir da melhor fonte disponível; pode não corresponder ao documento originalmente impresso.'
    )
  ),
  schema_version = coalesce(document.schema_version, 1),
  template_id = coalesce(document.template_id, 'legacy-unknown'),
  template_version = coalesce(document.template_version, 1),
  renderer_version = coalesce(document.renderer_version, 1),
  immutable_at = coalesce(document.immutable_at, document.issued_at, document.created_at),
  legacy_migrated_at = coalesce(document.legacy_migrated_at, now()),
  legacy_source = coalesce(document.legacy_source, case
    when document.pdf_storage_path is not null then 'persisted_pdf'
    when document.rendered_html is not null then 'persisted_html'
    when document.content ? 'prescription' then 'partial_snapshot'
    else 'structured_payload'
  end),
  legacy_confidence = coalesce(document.legacy_confidence, case
    when document.pdf_storage_path is not null then 'high'
    when document.rendered_html is not null then 'medium'
    else 'low'
  end),
  pdf_status = case when document.pdf_storage_path is not null then 'available' else document.pdf_status end
where document.status in ('finalized', 'signed', 'archived', 'cancelled')
  and document.snapshot_json is null;

update public.clinical_documents
set
  rendered_html = public.render_official_prescription_html(snapshot_json),
  content_hash = public.canonical_jsonb_sha256(snapshot_json),
  hash_algorithm = 'SHA-256',
  hash_generated_at = now()
where snapshot_json is not null
  and status in ('finalized', 'signed', 'archived', 'cancelled')
  and (rendered_html is null or content_hash is null);

create or replace function public.enforce_clinical_document_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  lifecycle_change boolean := current_setting('app.document_lifecycle', true) = 'true';
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Sessão expirada.';
  end if;

  select appointment.* into source
  from public.appointments appointment
  join public.profiles profile on profile.id = current_user_id and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member on member.clinic_id = appointment.clinic_id
    and member.user_id = current_user_id and member.status = 'active'
    and member.role in ('doctor', 'clinic_admin')
  where appointment.id = new.appointment_id;

  if source.id is null then
    raise exception using errcode = '42501', message = 'Consulta não pertence à clínica ativa ou o usuário não possui vínculo profissional ativo.';
  end if;
  if source.professional_id <> current_user_id then
    raise exception using errcode = '42501', message = 'Somente o profissional responsável pela consulta pode alterar este documento.';
  end if;

  if tg_op = 'INSERT' then
    new.clinic_id := source.clinic_id;
    new.patient_id := source.patient_id;
    new.professional_id := source.professional_id;
    new.created_by := current_user_id;
    new.status := coalesce(new.status, 'draft');
  else
    if new.clinic_id is distinct from old.clinic_id
      or new.patient_id is distinct from old.patient_id
      or new.appointment_id is distinct from old.appointment_id
      or new.professional_id is distinct from old.professional_id
      or new.created_by is distinct from old.created_by then
      raise exception using errcode = '42501', message = 'Os vínculos do documento não podem ser alterados.';
    end if;

    if old.status in ('finalized', 'signed', 'archived', 'cancelled') then
      if new.snapshot_json is distinct from old.snapshot_json
        or new.rendered_html is distinct from old.rendered_html
        or new.content_hash is distinct from old.content_hash
        or new.hash_algorithm is distinct from old.hash_algorithm
        or new.public_number is distinct from old.public_number
        or new.title is distinct from old.title
        or new.content is distinct from old.content
        or new.template_id is distinct from old.template_id
        or new.template_version is distinct from old.template_version
        or new.renderer_version is distinct from old.renderer_version
        or new.schema_version is distinct from old.schema_version
        or new.issued_at is distinct from old.issued_at
        or new.issued_by is distinct from old.issued_by
        or new.immutable_at is distinct from old.immutable_at then
        insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, result)
        values (old.clinic_id, old.id, current_user_id, 'immutable_update_blocked', 'blocked');
        raise exception using errcode = '42501', message = 'Este documento já foi emitido e não pode ser alterado. Para corrigir as informações, cancele ou substitua o documento e emita uma nova versão.';
      end if;

      if not lifecycle_change and (
        new.status is distinct from old.status
        or new.pdf_storage_path is distinct from old.pdf_storage_path
        or new.pdf_status is distinct from old.pdf_status
        or new.supersedes_document_id is distinct from old.supersedes_document_id
        or new.superseded_by_document_id is distinct from old.superseded_by_document_id
        or new.cancelled_at is distinct from old.cancelled_at
        or new.cancelled_by is distinct from old.cancelled_by
        or new.cancellation_reason is distinct from old.cancellation_reason
      ) then
        raise exception using errcode = '42501', message = 'Use a função segura para alterar o ciclo de vida do documento.';
      end if;
    elsif new.status is distinct from old.status and not lifecycle_change then
      raise exception using errcode = '42501', message = 'Use a função segura para alterar o ciclo de vida do documento.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists clinical_documents_enforce_tenant on public.clinical_documents;
create trigger clinical_documents_enforce_tenant
before insert or update on public.clinical_documents
for each row execute function public.enforce_clinical_document_tenant();

create or replace function public.issue_prescription_document_atomic(
  target_appointment_id uuid,
  medical_record_payload jsonb,
  prescription_snapshot jsonb,
  idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  target_record_id uuid;
  target_document_id uuid;
  target_document_type public.clinical_document_type;
  target_title text;
  target_public_number bigint;
  issued_timestamp timestamptz := now();
  official_snapshot jsonb;
  clinic_snapshot jsonb;
  patient_snapshot jsonb;
  professional_snapshot jsonb;
  settings_snapshot jsonb;
begin
  if current_user_id is null then raise exception using errcode = '28000', message = 'Sessão expirada.'; end if;
  if nullif(trim(idempotency_key), '') is null then raise exception using errcode = '22023', message = 'Chave de idempotência inválida.'; end if;
  if jsonb_typeof(prescription_snapshot -> 'medications') <> 'array'
    or jsonb_array_length(prescription_snapshot -> 'medications') = 0 then
    raise exception using errcode = '23514', message = 'Adicione ao menos um medicamento antes de emitir.';
  end if;

  select appointment.* into source
  from public.appointments appointment
  join public.profiles profile on profile.id = current_user_id and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member on member.clinic_id = appointment.clinic_id
    and member.user_id = current_user_id and member.status = 'active'
    and member.role in ('doctor', 'clinic_admin')
  where appointment.id = target_appointment_id
  for update of appointment;

  if source.id is null then raise exception using errcode = '42501', message = 'Consulta não encontrada na clínica ativa.'; end if;
  if source.professional_id <> current_user_id then raise exception using errcode = '42501', message = 'Somente o profissional responsável pode emitir a receita.'; end if;
  if source.status <> 'in_progress' then raise exception using errcode = '22023', message = 'A receita só pode ser emitida durante o atendimento.'; end if;

  select id into target_document_id
  from public.clinical_documents
  where clinic_id = source.clinic_id
    and content ->> 'idempotency_key' = trim(idempotency_key)
    and document_type in ('prescription', 'special_prescription')
    and deleted_at is null;
  if target_document_id is not null then return target_document_id; end if;

  insert into public.medical_records (
    appointment_id, clinic_id, patient_id, professional_id, status,
    chief_complaint, hpi, pmh, medications, allergies, family_history,
    social_history, physical_exam, vital_signs, assessment, cid10, plan,
    prescription, exam_requests, certificate, return_guidance, guidance, last_saved_at
  )
  values (
    source.id, source.clinic_id, source.patient_id, source.professional_id, 'draft',
    nullif(trim(medical_record_payload ->> 'chief_complaint'), ''),
    nullif(trim(medical_record_payload ->> 'hpi'), ''),
    nullif(trim(medical_record_payload ->> 'pmh'), ''),
    nullif(trim(medical_record_payload ->> 'medications'), ''),
    nullif(trim(medical_record_payload ->> 'allergies'), ''),
    nullif(trim(medical_record_payload ->> 'family_history'), ''),
    nullif(trim(medical_record_payload ->> 'social_history'), ''),
    nullif(trim(medical_record_payload ->> 'physical_exam'), ''),
    nullif(trim(medical_record_payload ->> 'vital_signs'), ''),
    nullif(trim(medical_record_payload ->> 'assessment'), ''),
    nullif(trim(medical_record_payload ->> 'cid10'), ''),
    nullif(trim(medical_record_payload ->> 'plan'), ''),
    nullif(trim(medical_record_payload ->> 'prescription'), ''),
    nullif(trim(medical_record_payload ->> 'exam_requests'), ''),
    nullif(trim(medical_record_payload ->> 'certificate'), ''),
    nullif(trim(medical_record_payload ->> 'return_guidance'), ''),
    nullif(trim(medical_record_payload ->> 'guidance'), ''),
    issued_timestamp
  )
  on conflict (appointment_id) where deleted_at is null
  do update set
    chief_complaint = excluded.chief_complaint, hpi = excluded.hpi, pmh = excluded.pmh,
    medications = excluded.medications, allergies = excluded.allergies,
    family_history = excluded.family_history, social_history = excluded.social_history,
    physical_exam = excluded.physical_exam, vital_signs = excluded.vital_signs,
    assessment = excluded.assessment, cid10 = excluded.cid10, plan = excluded.plan,
    prescription = excluded.prescription, exam_requests = excluded.exam_requests,
    certificate = excluded.certificate, return_guidance = excluded.return_guidance,
    guidance = excluded.guidance, last_saved_at = issued_timestamp, updated_at = issued_timestamp
  where medical_records.status = 'draft'
  returning id into target_record_id;
  if target_record_id is null then raise exception using errcode = '42501', message = 'O prontuário finalizado não pode receber alterações.'; end if;

  target_document_type := case prescription_snapshot ->> 'type'
    when 'special_control' then 'special_prescription'::public.clinical_document_type
    else 'prescription'::public.clinical_document_type end;
  target_title := case target_document_type
    when 'special_prescription' then 'Receita de controle especial'
    else 'Receita médica' end;

  select to_jsonb(clinic) - 'created_at' - 'updated_at' - 'status' - 'plan'
  into clinic_snapshot from public.clinics clinic where clinic.id = source.clinic_id;
  select jsonb_build_object(
    'id', patient.id, 'name', coalesce(patient.social_name, patient.full_name),
    'legal_name', patient.full_name, 'birth_date', patient.birth_date, 'cpf', patient.cpf
  ) into patient_snapshot from public.patients patient where patient.id = source.patient_id;
  select jsonb_build_object(
    'id', source.professional_id,
    'name', coalesce(professional.professional_name, profile.full_name),
    'legal_name', profile.full_name,
    'profession', professional.profession,
    'council', professional.council,
    'council_number', professional.council_number,
    'council_state', professional.council_state,
    'specialty', professional.specialty,
    'rqe', professional.rqe,
    'registration_text', concat_ws(' ', professional.council, professional.council_number)
      || case when professional.council_state is not null then '/' || professional.council_state else '' end
  ) into professional_snapshot
  from public.profiles profile
  left join public.professional_profiles professional
    on professional.clinic_id = source.clinic_id and professional.user_id = source.professional_id
  where profile.id = source.professional_id;
  select to_jsonb(settings) - 'updated_at' - 'updated_by'
  into settings_snapshot from public.document_settings settings where settings.clinic_id = source.clinic_id;

  insert into public.clinical_documents (
    clinic_id, patient_id, appointment_id, medical_record_id, professional_id,
    document_type, title, content, status, created_by, issued_at, issued_by,
    template_id, template_version, renderer_version, schema_version,
    document_version, immutable_at, pdf_status
  )
  values (
    source.clinic_id, source.patient_id, source.id, target_record_id, source.professional_id,
    target_document_type, target_title,
    jsonb_build_object('idempotency_key', trim(idempotency_key), 'text', coalesce(medical_record_payload ->> 'prescription', '')),
    'draft', current_user_id, issued_timestamp, current_user_id,
    'prescription-simple', 1, 1, 2, 1, issued_timestamp, 'pending'
  )
  returning id, public_number into target_document_id, target_public_number;

  official_snapshot := jsonb_build_object(
    'schema_version', 2,
    'origin', 'native_official',
    'is_legacy', false,
    'title', target_title,
    'document_type', target_document_type,
    'public_number', target_public_number,
    'document_version', 1,
    'issued_at', issued_timestamp,
    'timezone', 'America/Bahia',
    'status_at_issuance', 'finalized',
    'template', jsonb_build_object('id', 'prescription-simple', 'version', 1, 'renderer_version', 1),
    'identifiers', jsonb_build_object(
      'document_id', target_document_id, 'clinic_id', source.clinic_id,
      'patient_id', source.patient_id, 'appointment_id', source.id,
      'medical_record_id', target_record_id, 'professional_id', source.professional_id,
      'prescription_id', prescription_snapshot ->> 'id'
    ),
    'patient', patient_snapshot,
    'professional', professional_snapshot,
    'clinic', coalesce(clinic_snapshot, '{}'::jsonb)
      || jsonb_build_object(
        'address_text', concat_ws(', ',
          clinic_snapshot ->> 'address', clinic_snapshot ->> 'address_number',
          clinic_snapshot ->> 'address_complement', clinic_snapshot ->> 'neighborhood',
          clinic_snapshot ->> 'city', clinic_snapshot ->> 'state',
          clinic_snapshot ->> 'zip_code')
      ),
    'document_settings', coalesce(settings_snapshot, '{}'::jsonb),
    'prescription', jsonb_build_object(
      'payload', prescription_snapshot - '_official_presentation',
      'presentation', coalesce(prescription_snapshot -> '_official_presentation', '{}'::jsonb)
    )
  );

  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents
  set
    snapshot_json = official_snapshot,
    rendered_html = public.render_official_prescription_html(official_snapshot),
    content_hash = public.canonical_jsonb_sha256(official_snapshot),
    hash_algorithm = 'SHA-256',
    hash_generated_at = issued_timestamp,
    status = 'finalized',
    updated_at = issued_timestamp
  where id = target_document_id;

  insert into public.prescription_items (
    clinic_id, document_id, medication_name, concentration, pharmaceutical_form,
    route, dosage, frequency, duration, quantity, instructions, controlled, sort_order
  )
  select source.clinic_id, target_document_id, trim(item.value ->> 'name'),
    coalesce(item.value ->> 'concentration', ''),
    coalesce(item.value ->> 'presentation', item.value ->> 'pharmaceuticalForm', ''),
    coalesce(item.value ->> 'route', ''), coalesce(item.value ->> 'dose', ''),
    coalesce(item.value ->> 'frequency', ''), coalesce(item.value ->> 'duration', ''),
    coalesce(item.value ->> 'quantity', ''), coalesce(item.value ->> 'notes', ''),
    target_document_type = 'special_prescription', item.ordinality - 1
  from jsonb_array_elements(prescription_snapshot -> 'medications') with ordinality as item(value, ordinality)
  where nullif(trim(item.value ->> 'name'), '') is not null;
  if not found then raise exception using errcode = '23514', message = 'A receita não possui medicamentos válidos.'; end if;

  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, metadata)
  values (
    source.clinic_id, target_document_id, current_user_id, 'issued',
    jsonb_build_object('hash_algorithm', 'SHA-256', 'content_hash', public.canonical_jsonb_sha256(official_snapshot), 'schema_version', 2)
  );
  return target_document_id;
end
$$;

create or replace function public.cancel_clinical_document(target_document_id uuid, reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  doc public.clinical_documents%rowtype;
begin
  select * into doc from public.clinical_documents
  where id = target_document_id and clinic_id = public.active_clinic_id() and deleted_at is null
  for update;
  if doc.id is null or doc.professional_id <> auth.uid() then raise exception using errcode = '42501', message = 'Documento não encontrado na clínica ativa.'; end if;
  if doc.status = 'cancelled' then return doc.id; end if;
  if doc.status not in ('finalized', 'signed') or nullif(trim(reason), '') is null then
    raise exception using errcode = '23514', message = 'Informe o motivo para cancelar um documento finalizado.';
  end if;
  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents set status = 'cancelled', cancelled_at = now(),
    cancelled_by = auth.uid(), cancellation_reason = trim(reason) where id = doc.id;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, metadata)
  values (doc.clinic_id, doc.id, auth.uid(), 'cancelled', jsonb_build_object('reason', trim(reason)));
  return doc.id;
end
$$;

create or replace function public.issue_clinical_document(target_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  doc public.clinical_documents%rowtype;
  issued_timestamp timestamptz := now();
  official_snapshot jsonb;
begin
  select * into doc from public.clinical_documents
  where id = target_document_id and clinic_id = public.active_clinic_id() and deleted_at is null
  for update;
  if doc.id is null or doc.professional_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Documento não encontrado na clínica ativa.';
  end if;
  if doc.status = 'finalized' then return doc.id; end if;
  if doc.status not in ('draft', 'in_review') then
    raise exception using errcode = '22023', message = 'Este documento não pode ser finalizado no estado atual.';
  end if;
  if nullif(trim(doc.title), '') is null then
    raise exception using errcode = '23514', message = 'Informe o título antes de finalizar.';
  end if;
  if doc.document_type in ('prescription', 'special_prescription') and not exists (
    select 1 from public.prescription_items item
    where item.document_id = doc.id and item.clinic_id = doc.clinic_id
      and nullif(trim(item.medication_name), '') is not null
  ) then
    raise exception using errcode = '23514', message = 'Adicione ao menos um medicamento antes de finalizar.';
  end if;

  official_snapshot := jsonb_build_object(
    'schema_version', 2,
    'origin', 'native_official',
    'is_legacy', false,
    'title', doc.title,
    'document_type', doc.document_type,
    'public_number', doc.public_number,
    'document_version', doc.document_version,
    'issued_at', issued_timestamp,
    'timezone', 'America/Bahia',
    'status_at_issuance', 'finalized',
    'template', jsonb_build_object('id', 'clinical-document-standard', 'version', 1, 'renderer_version', 1),
    'identifiers', jsonb_build_object(
      'document_id', doc.id, 'clinic_id', doc.clinic_id, 'patient_id', doc.patient_id,
      'appointment_id', doc.appointment_id, 'medical_record_id', doc.medical_record_id,
      'professional_id', doc.professional_id
    ),
    'patient', (
      select jsonb_build_object(
        'id', patient.id, 'name', coalesce(patient.social_name, patient.full_name),
        'legal_name', patient.full_name, 'birth_date', patient.birth_date, 'cpf', patient.cpf
      ) from public.patients patient where patient.id = doc.patient_id
    ),
    'professional', (
      select jsonb_build_object(
        'id', doc.professional_id, 'name', coalesce(professional.professional_name, profile.full_name),
        'legal_name', profile.full_name, 'profession', professional.profession,
        'council', professional.council, 'council_number', professional.council_number,
        'council_state', professional.council_state, 'specialty', professional.specialty,
        'rqe', professional.rqe,
        'registration_text', concat_ws(' ', professional.council, professional.council_number)
          || case when professional.council_state is not null then '/' || professional.council_state else '' end
      )
      from public.profiles profile
      left join public.professional_profiles professional
        on professional.clinic_id = doc.clinic_id and professional.user_id = doc.professional_id
      where profile.id = doc.professional_id
    ),
    'clinic', (
      select (to_jsonb(clinic) - 'created_at' - 'updated_at' - 'status' - 'plan')
        || jsonb_build_object(
          'address_text', concat_ws(', ', clinic.address, clinic.address_number,
            clinic.address_complement, clinic.neighborhood, clinic.city, clinic.state, clinic.zip_code)
        )
      from public.clinics clinic where clinic.id = doc.clinic_id
    ),
    'document_settings', (
      select to_jsonb(settings) - 'updated_at' - 'updated_by'
      from public.document_settings settings where settings.clinic_id = doc.clinic_id
    ),
    'content', doc.content,
    'prescription', jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(to_jsonb(item) - 'clinic_id' - 'document_id' order by item.sort_order)
        from public.prescription_items item where item.document_id = doc.id
      ), '[]'::jsonb)
    )
  );

  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents
  set status = 'finalized', issued_at = issued_timestamp, issued_by = auth.uid(),
    snapshot_json = official_snapshot,
    rendered_html = public.render_official_prescription_html(official_snapshot),
    content_hash = public.canonical_jsonb_sha256(official_snapshot),
    hash_algorithm = 'SHA-256', hash_generated_at = issued_timestamp,
    template_id = 'clinical-document-standard', template_version = 1,
    renderer_version = 1, schema_version = 2, immutable_at = issued_timestamp,
    pdf_status = 'pending'
  where id = doc.id;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, metadata)
  values (doc.clinic_id, doc.id, auth.uid(), 'issued',
    jsonb_build_object('content_hash', public.canonical_jsonb_sha256(official_snapshot), 'schema_version', 2));
  return doc.id;
end
$$;

create or replace function public.mark_clinical_document_printed(target_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target public.clinical_documents%rowtype;
begin
  select * into target from public.clinical_documents
  where id = target_document_id and clinic_id = public.active_clinic_id()
    and status in ('finalized', 'signed', 'archived', 'cancelled');
  if target.id is null then return; end if;
  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents set printed_at = coalesce(printed_at, now()) where id = target.id;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type)
  values (target.clinic_id, target.id, auth.uid(), case when target.printed_at is null then 'printed' else 'reprinted' end);
end
$$;

create or replace function public.supersede_clinical_document(
  previous_document_id uuid,
  replacement_document_id uuid,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_doc public.clinical_documents%rowtype;
  replacement_doc public.clinical_documents%rowtype;
begin
  if nullif(trim(reason), '') is null then raise exception using errcode = '23514', message = 'Informe o motivo da substituição.'; end if;
  select * into previous_doc from public.clinical_documents
    where id = previous_document_id and clinic_id = public.active_clinic_id() for update;
  select * into replacement_doc from public.clinical_documents
    where id = replacement_document_id and clinic_id = public.active_clinic_id() for update;
  if previous_doc.id is null or replacement_doc.id is null then raise exception using errcode = 'P0002', message = 'Documento da cadeia de versões não encontrado.'; end if;
  if previous_doc.professional_id <> auth.uid() or replacement_doc.professional_id <> auth.uid()
    or previous_doc.patient_id <> replacement_doc.patient_id
    or previous_doc.document_type <> replacement_doc.document_type then
    raise exception using errcode = '42501', message = 'Os documentos não podem formar uma cadeia de versões.';
  end if;
  if previous_doc.status not in ('finalized', 'signed') or replacement_doc.status <> 'finalized' then
    raise exception using errcode = '22023', message = 'A substituição exige dois documentos oficiais válidos.';
  end if;
  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents set status = 'archived',
    superseded_by_document_id = replacement_doc.id, cancellation_reason = trim(reason)
    where id = previous_doc.id;
  update public.clinical_documents set supersedes_document_id = previous_doc.id
    where id = replacement_doc.id;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, metadata)
  values
    (previous_doc.clinic_id, previous_doc.id, auth.uid(), 'superseded', jsonb_build_object('replacement_document_id', replacement_doc.id, 'reason', trim(reason))),
    (replacement_doc.clinic_id, replacement_doc.id, auth.uid(), 'supersedes', jsonb_build_object('previous_document_id', previous_doc.id, 'reason', trim(reason)));
  return replacement_doc.id;
end
$$;

create or replace function public.record_clinical_document_access(
  target_document_id uuid,
  access_event text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clinical_documents%rowtype;
begin
  if access_event not in ('viewed', 'downloaded', 'integrity_checked') then
    raise exception using errcode = '22023', message = 'Evento de acesso documental inválido.';
  end if;
  select * into target from public.clinical_documents
  where id = target_document_id and clinic_id = public.active_clinic_id()
    and deleted_at is null;
  if target.id is null then
    raise exception using errcode = 'P0002', message = 'Documento não encontrado na clínica ativa.';
  end if;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type)
  values (target.clinic_id, target.id, auth.uid(), access_event);
end
$$;

create or replace function public.set_clinical_document_pdf_result(
  target_document_id uuid,
  storage_path text,
  generation_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clinical_documents%rowtype;
  expected_prefix text;
begin
  if generation_status not in ('available', 'failed') then
    raise exception using errcode = '22023', message = 'Estado de geração do PDF inválido.';
  end if;
  select * into target from public.clinical_documents
  where id = target_document_id and clinic_id = public.active_clinic_id()
    and professional_id = auth.uid() and deleted_at is null
  for update;
  if target.id is null or target.status not in ('finalized', 'signed') then
    raise exception using errcode = '42501', message = 'Documento oficial não encontrado para vincular o PDF.';
  end if;
  if target.pdf_storage_path is not null then
    if target.pdf_storage_path = storage_path and target.pdf_status = 'available' then return; end if;
    raise exception using errcode = '23505', message = 'O documento já possui um PDF oficial e ele não pode ser sobrescrito.';
  end if;
  expected_prefix := format('clinics/%s/documents/%s/', target.clinic_id, target.id);
  if generation_status = 'available'
    and (storage_path is null or left(storage_path, length(expected_prefix)) <> expected_prefix) then
    raise exception using errcode = '22023', message = 'Caminho do PDF oficial inválido.';
  end if;
  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents
  set pdf_storage_path = case when generation_status = 'available' then storage_path else null end,
    pdf_status = generation_status
  where id = target.id;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, result, metadata)
  values (
    target.clinic_id, target.id, auth.uid(), 'pdf_generation',
    case when generation_status = 'available' then 'success' else 'failed' end,
    jsonb_build_object('storage_path', storage_path)
  );
end
$$;

revoke all on function public.issue_prescription_document_atomic(uuid, jsonb, jsonb, text) from public;
revoke all on function public.issue_clinical_document(uuid) from public;
revoke all on function public.cancel_clinical_document(uuid, text) from public;
revoke all on function public.mark_clinical_document_printed(uuid) from public;
revoke all on function public.supersede_clinical_document(uuid, uuid, text) from public;
revoke all on function public.record_clinical_document_access(uuid, text) from public;
revoke all on function public.set_clinical_document_pdf_result(uuid, text, text) from public;
grant execute on function public.issue_prescription_document_atomic(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.issue_clinical_document(uuid) to authenticated;
grant execute on function public.cancel_clinical_document(uuid, text) to authenticated;
grant execute on function public.mark_clinical_document_printed(uuid) to authenticated;
grant execute on function public.supersede_clinical_document(uuid, uuid, text) to authenticated;
grant execute on function public.record_clinical_document_access(uuid, text) to authenticated;
grant execute on function public.set_clinical_document_pdf_result(uuid, text, text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('clinical-documents', 'clinical-documents', false, 15728640, array['application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.clinical_document_asset_clinic_id(object_name text)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if object_name !~ '^clinics/[0-9a-fA-F-]{36}/documents/[0-9a-fA-F-]{36}/[^/]+\.pdf$' then return null; end if;
  return (storage.foldername(object_name))[2]::uuid;
exception when invalid_text_representation then return null;
end
$$;

create or replace function public.clinical_document_asset_document_id(object_name text)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if object_name !~ '^clinics/[0-9a-fA-F-]{36}/documents/[0-9a-fA-F-]{36}/[^/]+\.pdf$' then return null; end if;
  return (storage.foldername(object_name))[4]::uuid;
exception when invalid_text_representation then return null;
end
$$;

grant execute on function public.clinical_document_asset_clinic_id(text) to authenticated;
grant execute on function public.clinical_document_asset_document_id(text) to authenticated;

drop policy if exists "Clinic members read official documents" on storage.objects;
drop policy if exists "Professionals upload official documents" on storage.objects;
create policy "Clinic members read official documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'clinical-documents'
    and public.is_active_clinic_member(public.clinical_document_asset_clinic_id(name))
  );
create policy "Professionals upload official documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'clinical-documents'
    and public.clinical_document_asset_clinic_id(name) = public.active_clinic_id()
    and exists (
      select 1 from public.clinical_documents document
      where document.id = public.clinical_document_asset_document_id(name)
        and document.clinic_id = public.active_clinic_id()
        and document.professional_id = auth.uid()
        and document.status in ('finalized', 'signed')
        and document.pdf_storage_path is null
    )
  );

commit;
select pg_notify('pgrst', 'reload schema');
