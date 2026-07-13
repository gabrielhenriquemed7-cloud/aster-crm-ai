begin;

alter table public.clinics add column if not exists logo_url text;

alter table public.clinical_documents add column if not exists clinic_id uuid references public.clinics(id) on delete restrict;
alter table public.clinical_documents add column if not exists patient_id uuid references public.patients(id) on delete restrict;
alter table public.clinical_documents add column if not exists appointment_id uuid references public.appointments(id) on delete restrict;
alter table public.clinical_documents add column if not exists medical_record_id uuid references public.medical_records(id) on delete restrict;
alter table public.clinical_documents add column if not exists professional_id uuid references auth.users(id) on delete restrict;
alter table public.clinical_documents add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table public.clinical_documents add column if not exists document_type public.clinical_document_type;
alter table public.clinical_documents add column if not exists title text;
alter table public.clinical_documents add column if not exists content jsonb not null default '{}'::jsonb;
alter table public.clinical_documents add column if not exists status public.clinical_document_status default 'draft';
alter table public.clinical_documents add column if not exists issued_at timestamptz;
alter table public.clinical_documents add column if not exists issued_by uuid references auth.users(id);
alter table public.clinical_documents add column if not exists updated_at timestamptz not null default now();
alter table public.clinical_documents add column if not exists deleted_at timestamptz;

create index if not exists clinical_documents_active_clinic_appointment_idx
  on public.clinical_documents(clinic_id, appointment_id, created_at desc)
  where deleted_at is null;
create index if not exists clinical_documents_active_clinic_patient_idx
  on public.clinical_documents(clinic_id, patient_id, created_at desc)
  where deleted_at is null;
create index if not exists prescription_items_clinic_document_idx
  on public.prescription_items(clinic_id, document_id, sort_order);

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
  join public.profiles profile
    on profile.id = current_user_id
   and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member
    on member.clinic_id = appointment.clinic_id
   and member.user_id = current_user_id
   and member.status = 'active'
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
    if old.status <> 'draft' and not lifecycle_change then
      raise exception using errcode = '42501', message = 'Documento emitido ou cancelado não pode ser alterado.';
    end if;
    if new.status is distinct from old.status and not lifecycle_change then
      raise exception using errcode = '42501', message = 'Use a função segura para emitir ou cancelar documentos.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists clinical_documents_enforce_tenant on public.clinical_documents;
create trigger clinical_documents_enforce_tenant
before insert or update on public.clinical_documents
for each row execute function public.enforce_clinical_document_tenant();

create or replace function public.issue_clinical_document(target_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  active_clinic uuid := public.active_clinic_id();
  doc public.clinical_documents%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Sessão expirada.';
  end if;
  if active_clinic is null then
    raise exception using errcode = '42501', message = 'Clínica ativa ou vínculo ativo não encontrado.';
  end if;

  select * into doc
  from public.clinical_documents
  where id = target_document_id
    and clinic_id = active_clinic
    and deleted_at is null
  for update;

  if doc.id is null then
    raise exception using errcode = 'P0002', message = 'Documento não encontrado na clínica ativa.';
  end if;
  if doc.professional_id <> current_user_id then
    raise exception using errcode = '42501', message = 'Somente o profissional responsável pode emitir o documento.';
  end if;
  if not exists (
    select 1 from public.clinic_members member
    where member.clinic_id = active_clinic
      and member.user_id = current_user_id
      and member.status = 'active'
      and member.role in ('doctor', 'clinic_admin')
  ) then
    raise exception using errcode = '42501', message = 'O profissional não possui vínculo ativo com a clínica.';
  end if;
  if not exists (
    select 1 from public.appointments appointment
    where appointment.id = doc.appointment_id
      and appointment.clinic_id = doc.clinic_id
      and appointment.patient_id = doc.patient_id
      and appointment.professional_id = doc.professional_id
  ) then
    raise exception using errcode = '23503', message = 'Os vínculos da consulta, paciente ou profissional são inconsistentes.';
  end if;
  if doc.status = 'issued' then return doc.id; end if;
  if doc.status <> 'draft' then
    raise exception using errcode = '22023', message = 'Documento cancelado não pode ser emitido.';
  end if;
  if nullif(trim(doc.title), '') is null then
    raise exception using errcode = '23514', message = 'Informe o título antes de emitir.';
  end if;
  if doc.document_type in ('prescription', 'special_prescription') and not exists (
    select 1 from public.prescription_items item
    where item.document_id = doc.id
      and item.clinic_id = doc.clinic_id
      and nullif(trim(item.medication_name), '') is not null
  ) then
    raise exception using errcode = '23514', message = 'Adicione ao menos um medicamento antes de emitir.';
  end if;
  if doc.document_type not in ('prescription', 'special_prescription') and not exists (
    select 1 from jsonb_each_text(coalesce(doc.content, '{}'::jsonb)) item
    where nullif(trim(item.value), '') is not null and item.value <> 'false'
  ) then
    raise exception using errcode = '23514', message = 'Preencha o conteúdo antes de emitir.';
  end if;

  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents
  set status = 'issued', issued_at = coalesce(issued_at, now()), issued_by = current_user_id
  where id = doc.id;

  if not found then
    raise exception using errcode = 'P0002', message = 'O documento não foi atualizado durante a emissão.';
  end if;
  return doc.id;
end;
$$;

alter table public.clinical_documents enable row level security;
alter table public.prescription_items enable row level security;
drop policy if exists "Clinic members view clinical documents" on public.clinical_documents;
drop policy if exists "Professionals create clinical documents" on public.clinical_documents;
drop policy if exists "Professionals update draft documents" on public.clinical_documents;
create policy "Clinic members view clinical documents" on public.clinical_documents for select to authenticated
using (public.is_active_clinic_member(clinic_id) and deleted_at is null);
create policy "Professionals create clinical documents" on public.clinical_documents for insert to authenticated
with check (clinic_id = public.active_clinic_id() and created_by = auth.uid() and professional_id = auth.uid());
create policy "Professionals update draft documents" on public.clinical_documents for update to authenticated
using (clinic_id = public.active_clinic_id() and professional_id = auth.uid() and status = 'draft')
with check (clinic_id = public.active_clinic_id() and professional_id = auth.uid() and status = 'draft');

drop policy if exists "Clinic members view prescription items" on public.prescription_items;
drop policy if exists "Professionals manage draft prescription items" on public.prescription_items;
create policy "Clinic members view prescription items" on public.prescription_items for select to authenticated
using (public.is_active_clinic_member(clinic_id));
create policy "Professionals manage draft prescription items" on public.prescription_items for all to authenticated
using (
  clinic_id = public.active_clinic_id()
  and exists (select 1 from public.clinical_documents doc where doc.id = document_id and doc.clinic_id = clinic_id and doc.status = 'draft' and doc.professional_id = auth.uid())
)
with check (
  clinic_id = public.active_clinic_id()
  and exists (select 1 from public.clinical_documents doc where doc.id = document_id and doc.clinic_id = clinic_id and doc.status = 'draft' and doc.professional_id = auth.uid())
);

grant select, insert, update on public.clinical_documents to authenticated;
grant select, insert, update, delete on public.prescription_items to authenticated;
revoke all on function public.issue_clinical_document(uuid) from public;
grant execute on function public.issue_clinical_document(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-assets', 'clinic-assets', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.clinic_asset_clinic_id(object_name text)
returns uuid language plpgsql stable security invoker set search_path = public
as $$
begin
  if object_name !~ '^clinics/[0-9a-fA-F-]{36}/logo/[^/]+$' then return null; end if;
  return (storage.foldername(object_name))[2]::uuid;
exception when invalid_text_representation then return null;
end;
$$;
grant execute on function public.clinic_asset_clinic_id(text) to authenticated;

drop policy if exists "Clinic members read clinic assets" on storage.objects;
drop policy if exists "Clinic admins upload clinic assets" on storage.objects;
drop policy if exists "Clinic admins update clinic assets" on storage.objects;
drop policy if exists "Clinic admins delete clinic assets" on storage.objects;
create policy "Clinic members read clinic assets" on storage.objects for select to authenticated
using (bucket_id = 'clinic-assets' and public.is_active_clinic_member(public.clinic_asset_clinic_id(name)));
create policy "Clinic admins upload clinic assets" on storage.objects for insert to authenticated
with check (bucket_id = 'clinic-assets' and public.is_active_clinic_admin() and public.clinic_asset_clinic_id(name) = public.active_clinic_id());
create policy "Clinic admins update clinic assets" on storage.objects for update to authenticated
using (bucket_id = 'clinic-assets' and public.is_active_clinic_admin() and public.clinic_asset_clinic_id(name) = public.active_clinic_id())
with check (bucket_id = 'clinic-assets' and public.is_active_clinic_admin() and public.clinic_asset_clinic_id(name) = public.active_clinic_id());
create policy "Clinic admins delete clinic assets" on storage.objects for delete to authenticated
using (bucket_id = 'clinic-assets' and public.is_active_clinic_admin() and public.clinic_asset_clinic_id(name) = public.active_clinic_id());

commit;
select pg_notify('pgrst', 'reload schema');
