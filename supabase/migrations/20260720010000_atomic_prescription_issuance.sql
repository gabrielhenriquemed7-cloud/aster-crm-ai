begin;

create unique index if not exists clinical_documents_prescription_idempotency_uidx
  on public.clinical_documents (
    clinic_id,
    (content ->> 'idempotency_key')
  )
  where document_type in ('prescription', 'special_prescription')
    and content ->> 'idempotency_key' is not null
    and deleted_at is null;

create or replace function public.issue_prescription_document_atomic(
  target_appointment_id uuid,
  medical_record_payload jsonb,
  prescription_snapshot jsonb,
  idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  target_record_id uuid;
  target_document_id uuid;
  target_document_type public.clinical_document_type;
  target_title text;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Sessão expirada.';
  end if;
  if nullif(trim(idempotency_key), '') is null then
    raise exception using errcode = '22023', message = 'Chave de idempotência inválida.';
  end if;
  if jsonb_typeof(prescription_snapshot -> 'medications') <> 'array'
    or jsonb_array_length(prescription_snapshot -> 'medications') = 0 then
    raise exception using errcode = '23514', message = 'Adicione ao menos um medicamento antes de emitir.';
  end if;

  select appointment.*
  into source
  from public.appointments appointment
  join public.profiles profile
    on profile.id = current_user_id
   and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member
    on member.clinic_id = appointment.clinic_id
   and member.user_id = current_user_id
   and member.status = 'active'
   and member.role in ('doctor', 'clinic_admin')
  where appointment.id = target_appointment_id
  for update of appointment;

  if source.id is null then
    raise exception using errcode = '42501', message = 'Consulta não encontrada na clínica ativa.';
  end if;
  if source.professional_id <> current_user_id then
    raise exception using errcode = '42501', message = 'Somente o profissional responsável pode emitir a receita.';
  end if;
  if source.status <> 'in_progress' then
    raise exception using errcode = '22023', message = 'A receita só pode ser emitida durante o atendimento.';
  end if;

  insert into public.medical_records (
    appointment_id,
    clinic_id,
    patient_id,
    professional_id,
    status,
    chief_complaint,
    hpi,
    pmh,
    medications,
    allergies,
    family_history,
    social_history,
    physical_exam,
    vital_signs,
    assessment,
    cid10,
    plan,
    prescription,
    exam_requests,
    certificate,
    return_guidance,
    guidance,
    last_saved_at
  )
  values (
    source.id,
    source.clinic_id,
    source.patient_id,
    source.professional_id,
    'draft',
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
    now()
  )
  on conflict (appointment_id) where deleted_at is null
  do update set
    chief_complaint = excluded.chief_complaint,
    hpi = excluded.hpi,
    pmh = excluded.pmh,
    medications = excluded.medications,
    allergies = excluded.allergies,
    family_history = excluded.family_history,
    social_history = excluded.social_history,
    physical_exam = excluded.physical_exam,
    vital_signs = excluded.vital_signs,
    assessment = excluded.assessment,
    cid10 = excluded.cid10,
    plan = excluded.plan,
    prescription = excluded.prescription,
    exam_requests = excluded.exam_requests,
    certificate = excluded.certificate,
    return_guidance = excluded.return_guidance,
    guidance = excluded.guidance,
    last_saved_at = now(),
    updated_at = now()
  where medical_records.status = 'draft'
  returning id into target_record_id;

  if target_record_id is null then
    raise exception using errcode = '42501', message = 'O prontuário finalizado não pode receber alterações.';
  end if;

  select id
  into target_document_id
  from public.clinical_documents
  where clinic_id = source.clinic_id
    and content ->> 'idempotency_key' = trim(idempotency_key)
    and document_type in ('prescription', 'special_prescription')
    and deleted_at is null;

  if target_document_id is not null then
    return target_document_id;
  end if;

  target_document_type :=
    case prescription_snapshot ->> 'type'
      when 'special_control' then 'special_prescription'::public.clinical_document_type
      else 'prescription'::public.clinical_document_type
    end;
  target_title :=
    case target_document_type
      when 'special_prescription' then 'Receita de controle especial'
      else 'Receita médica'
    end;

  insert into public.clinical_documents (
    clinic_id,
    patient_id,
    appointment_id,
    medical_record_id,
    professional_id,
    document_type,
    title,
    content,
    status,
    created_by
  )
  values (
    source.clinic_id,
    source.patient_id,
    source.id,
    target_record_id,
    source.professional_id,
    target_document_type,
    target_title,
    jsonb_build_object(
      'idempotency_key', trim(idempotency_key),
      'snapshot_version', 1,
      'prescription', prescription_snapshot,
      'text', coalesce(medical_record_payload ->> 'prescription', '')
    ),
    'draft',
    current_user_id
  )
  returning id into target_document_id;

  insert into public.prescription_items (
    clinic_id,
    document_id,
    medication_name,
    concentration,
    pharmaceutical_form,
    route,
    dosage,
    frequency,
    duration,
    quantity,
    instructions,
    controlled,
    sort_order
  )
  select
    source.clinic_id,
    target_document_id,
    trim(item.value ->> 'name'),
    coalesce(item.value ->> 'concentration', ''),
    coalesce(item.value ->> 'presentation', item.value ->> 'pharmaceuticalForm', ''),
    coalesce(item.value ->> 'route', ''),
    coalesce(item.value ->> 'dose', ''),
    coalesce(item.value ->> 'frequency', ''),
    coalesce(item.value ->> 'duration', ''),
    coalesce(item.value ->> 'quantity', ''),
    coalesce(item.value ->> 'notes', ''),
    target_document_type = 'special_prescription',
    item.ordinality - 1
  from jsonb_array_elements(prescription_snapshot -> 'medications')
    with ordinality as item(value, ordinality)
  where nullif(trim(item.value ->> 'name'), '') is not null;

  if not found then
    raise exception using errcode = '23514', message = 'A receita não possui medicamentos válidos.';
  end if;

  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents
  set
    status = 'issued',
    issued_at = now(),
    issued_by = current_user_id,
    updated_at = now()
  where id = target_document_id;

  return target_document_id;
end
$$;

revoke all on function public.issue_prescription_document_atomic(
  uuid,
  jsonb,
  jsonb,
  text
) from public;
grant execute on function public.issue_prescription_document_atomic(
  uuid,
  jsonb,
  jsonb,
  text
) to authenticated;

commit;
select pg_notify('pgrst', 'reload schema');
