begin;

do $$ begin create type public.clinical_document_type as enum ('prescription','special_prescription','medical_certificate','attendance_declaration','exam_request','referral','patient_guidance'); exception when duplicate_object then null; end $$;
do $$ begin create type public.clinical_document_status as enum ('draft','issued','cancelled'); exception when duplicate_object then null; end $$;
create sequence if not exists public.clinical_document_public_number_seq;

alter table public.clinics add column if not exists logo_url text;
alter table public.clinics add column if not exists address text;
alter table public.profiles add column if not exists professional_council text;
alter table public.profiles add column if not exists professional_registration text;
alter table public.profiles add column if not exists specialty text;
alter table public.profiles add column if not exists rqe text;

create table if not exists public.clinical_documents (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict, appointment_id uuid not null references public.appointments(id) on delete restrict,
  medical_record_id uuid references public.medical_records(id) on delete restrict, professional_id uuid not null references auth.users(id) on delete restrict,
  document_type public.clinical_document_type not null, title text not null, content jsonb not null default '{}'::jsonb,
  public_number bigint not null default nextval('public.clinical_document_public_number_seq'),
  status public.clinical_document_status not null default 'draft', issued_at timestamptz, issued_by uuid references auth.users(id),
  printed_at timestamptz, cancelled_at timestamptz, cancelled_by uuid references auth.users(id), cancellation_reason text,
  created_by uuid not null references auth.users(id) default auth.uid(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
alter table public.clinical_documents add column if not exists public_number bigint default nextval('public.clinical_document_public_number_seq');
alter sequence public.clinical_document_public_number_seq owned by public.clinical_documents.public_number;
create unique index if not exists clinical_documents_public_number_uidx on public.clinical_documents(public_number);
create index if not exists clinical_documents_clinic_patient_idx on public.clinical_documents(clinic_id, patient_id, created_at desc) where deleted_at is null;
create index if not exists clinical_documents_appointment_idx on public.clinical_documents(appointment_id, created_at desc) where deleted_at is null;
create index if not exists clinical_documents_record_idx on public.clinical_documents(medical_record_id) where deleted_at is null;

create table if not exists public.prescription_items (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete restrict,
  document_id uuid not null references public.clinical_documents(id) on delete cascade, medication_name text not null,
  concentration text, pharmaceutical_form text, route text, dosage text, frequency text, duration text, quantity text,
  instructions text, controlled boolean not null default false, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists prescription_items_document_idx on public.prescription_items(document_id, sort_order);

create table if not exists public.favorite_prescriptions (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null references auth.users(id) on delete cascade, name text not null, document_type public.clinical_document_type not null,
  content jsonb not null default '{}'::jsonb, items jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(clinic_id, professional_id, name)
);

create or replace function public.enforce_clinical_document_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare current_user_id uuid := auth.uid(); source public.appointments%rowtype;
begin
  select appointment.* into source from public.appointments appointment
  join public.profiles profile on profile.id = current_user_id and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member on member.clinic_id = appointment.clinic_id and member.user_id = current_user_id and member.status = 'active' and member.role in ('doctor','clinic_admin')
  where appointment.id = new.appointment_id;
  if source.id is null then raise exception using errcode='42501', message='Consulta não pertence à clínica ativa ou usuário não pode emitir documentos.'; end if;
  if tg_op = 'INSERT' then new.clinic_id := source.clinic_id; new.patient_id := source.patient_id; new.professional_id := source.professional_id; new.created_by := current_user_id;
  elsif old.status <> 'draft' and current_setting('app.document_lifecycle', true) is distinct from 'true' then raise exception using errcode='42501', message='Documento emitido ou cancelado não pode ser alterado.';
  elsif new.status is distinct from old.status and current_setting('app.document_lifecycle', true) is distinct from 'true' then raise exception using errcode='42501', message='Use a função segura para emitir ou cancelar documentos.';
  elsif new.clinic_id is distinct from old.clinic_id or new.patient_id is distinct from old.patient_id or new.appointment_id is distinct from old.appointment_id or new.professional_id is distinct from old.professional_id then raise exception using errcode='42501', message='Vínculos do documento não podem ser alterados.'; end if;
  if source.professional_id <> current_user_id then raise exception using errcode='42501', message='Somente o profissional responsável pode criar ou editar este documento.'; end if;
  new.updated_at := now(); return new;
end $$;
drop trigger if exists clinical_documents_enforce_tenant on public.clinical_documents;
create trigger clinical_documents_enforce_tenant before insert or update on public.clinical_documents for each row execute function public.enforce_clinical_document_tenant();

create or replace function public.issue_clinical_document(target_document_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare doc public.clinical_documents%rowtype; begin
  select * into doc from public.clinical_documents where id=target_document_id and deleted_at is null for update;
  if doc.id is null or doc.clinic_id <> public.active_clinic_id() or doc.professional_id <> auth.uid() then raise exception using errcode='42501', message='Documento não encontrado na clínica ativa.'; end if;
  if doc.status='issued' then return doc.id; end if;
  if doc.status<>'draft' then raise exception using errcode='22023', message='Documento cancelado não pode ser emitido.'; end if;
  if nullif(trim(doc.title),'') is null then raise exception using errcode='23514', message='Informe o título antes de emitir.'; end if;
  if doc.document_type in ('prescription','special_prescription') and not exists(select 1 from public.prescription_items where document_id=doc.id and nullif(trim(medication_name),'') is not null) then raise exception using errcode='23514', message='Adicione ao menos um medicamento antes de emitir.'; end if;
  if doc.document_type not in ('prescription','special_prescription') and not exists(select 1 from jsonb_each_text(doc.content) item where nullif(trim(item.value),'') is not null and item.value <> 'false') then raise exception using errcode='23514', message='Preencha o conteúdo antes de emitir.'; end if;
  perform set_config('app.document_lifecycle','true',true); update public.clinical_documents set status='issued', issued_at=now(), issued_by=auth.uid(), updated_at=now() where id=doc.id; return doc.id;
end $$;
create or replace function public.cancel_clinical_document(target_document_id uuid, reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare doc public.clinical_documents%rowtype; begin
  select * into doc from public.clinical_documents where id=target_document_id and deleted_at is null for update;
  if doc.id is null or doc.clinic_id <> public.active_clinic_id() or doc.professional_id <> auth.uid() then raise exception using errcode='42501', message='Documento não encontrado na clínica ativa.'; end if;
  if doc.status='cancelled' then return doc.id; end if;
  if doc.status<>'issued' or nullif(trim(reason),'') is null then raise exception using errcode='23514', message='Informe o motivo para cancelar um documento emitido.'; end if;
  perform set_config('app.document_lifecycle','true',true); update public.clinical_documents set status='cancelled', cancelled_at=now(), cancelled_by=auth.uid(), cancellation_reason=trim(reason), updated_at=now() where id=doc.id; return doc.id;
end $$;
create or replace function public.mark_clinical_document_printed(target_document_id uuid)
returns void language plpgsql security definer set search_path=public as $$ begin
  perform set_config('app.document_lifecycle','true',true); update public.clinical_documents set printed_at=coalesce(printed_at,now()) where id=target_document_id and clinic_id=public.active_clinic_id() and status in ('issued','cancelled');
end $$;

alter table public.clinical_documents enable row level security; alter table public.prescription_items enable row level security; alter table public.favorite_prescriptions enable row level security;
drop policy if exists "Clinic members view clinical documents" on public.clinical_documents;
drop policy if exists "Professionals create clinical documents" on public.clinical_documents;
drop policy if exists "Professionals update draft documents" on public.clinical_documents;
drop policy if exists "Clinic members view prescription items" on public.prescription_items;
drop policy if exists "Professionals manage draft prescription items" on public.prescription_items;
drop policy if exists "Professionals manage own favorites" on public.favorite_prescriptions;
create policy "Clinic members view clinical documents" on public.clinical_documents for select to authenticated using(public.is_active_clinic_member(clinic_id) and deleted_at is null);
create policy "Professionals create clinical documents" on public.clinical_documents for insert to authenticated with check(public.is_active_clinic_member(clinic_id) and created_by=auth.uid());
create policy "Professionals update draft documents" on public.clinical_documents for update to authenticated using(public.is_active_clinic_member(clinic_id) and professional_id=auth.uid() and status='draft') with check(public.is_active_clinic_member(clinic_id) and professional_id=auth.uid());
create policy "Clinic members view prescription items" on public.prescription_items for select to authenticated using(public.is_active_clinic_member(clinic_id));
create policy "Professionals manage draft prescription items" on public.prescription_items for all to authenticated using(public.is_active_clinic_member(clinic_id) and exists(select 1 from public.clinical_documents d where d.id=document_id and d.clinic_id=clinic_id and d.status='draft' and d.professional_id=auth.uid())) with check(public.is_active_clinic_member(clinic_id) and exists(select 1 from public.clinical_documents d where d.id=document_id and d.clinic_id=clinic_id and d.status='draft' and d.professional_id=auth.uid()));
create policy "Professionals manage own favorites" on public.favorite_prescriptions for all to authenticated using(clinic_id=public.active_clinic_id() and professional_id=auth.uid()) with check(clinic_id=public.active_clinic_id() and professional_id=auth.uid());
grant select,insert,update on public.clinical_documents to authenticated; grant select,insert,update,delete on public.prescription_items to authenticated; grant select,insert,update,delete on public.favorite_prescriptions to authenticated;
revoke all on function public.issue_clinical_document(uuid), public.cancel_clinical_document(uuid,text), public.mark_clinical_document_printed(uuid) from public;
grant execute on function public.issue_clinical_document(uuid), public.cancel_clinical_document(uuid,text), public.mark_clinical_document_printed(uuid) to authenticated;

commit;
select pg_notify('pgrst','reload schema');
