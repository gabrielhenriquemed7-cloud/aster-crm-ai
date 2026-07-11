begin;

do $$ begin
  create type public.medical_record_status as enum ('draft', 'finalized', 'amended');
exception when duplicate_object then null; end $$;

alter table public.appointments add column if not exists arrived_at timestamptz;
alter table public.appointments add column if not exists started_at timestamptz;
alter table public.appointments add column if not exists completed_at timestamptz;
alter table public.appointments add column if not exists completed_by uuid;
alter table public.medical_records add column if not exists status public.medical_record_status not null default 'draft';
alter table public.medical_records add column if not exists finalized_at timestamptz;
alter table public.medical_records add column if not exists finalized_by uuid;
alter table public.medical_records add column if not exists last_saved_at timestamptz;
alter table public.medical_records add column if not exists vital_signs text;
alter table public.medical_records add column if not exists guidance text;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_completed_by_fkey') then
    alter table public.appointments add constraint appointments_completed_by_fkey foreign key (completed_by) references auth.users(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.medical_records'::regclass and conname = 'medical_records_finalized_by_fkey') then
    alter table public.medical_records add constraint medical_records_finalized_by_fkey foreign key (finalized_by) references auth.users(id) on delete restrict not valid;
  end if;
end $$;

create table if not exists public.medical_record_addenda (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references public.medical_records(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  content text not null check (trim(content) <> ''),
  reason text not null check (trim(reason) <> ''),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists medical_record_addenda_record_idx on public.medical_record_addenda(medical_record_id, created_at);

create or replace function public.start_clinical_encounter(target_appointment_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  target_record_id uuid;
begin
  select appointment.* into source
  from public.appointments appointment
  join public.profiles profile on profile.id = current_user_id and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member on member.clinic_id = appointment.clinic_id and member.user_id = current_user_id and member.status = 'active'
  where appointment.id = target_appointment_id for update of appointment;
  if source.id is null then raise exception using errcode = '42501', message = 'Consulta não encontrada na clínica ativa.'; end if;
  if source.professional_id <> current_user_id then raise exception using errcode = '42501', message = 'Somente o profissional responsável pode iniciar o atendimento.'; end if;
  if source.status not in ('waiting', 'in_progress') then raise exception using errcode = '22023', message = 'A consulta precisa estar aguardando para iniciar o atendimento.'; end if;

  update public.appointments set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now() where id = source.id;
  insert into public.medical_records (appointment_id, clinic_id, patient_id, professional_id, status, last_saved_at)
  values (source.id, source.clinic_id, source.patient_id, source.professional_id, 'draft', now())
  on conflict (appointment_id) where deleted_at is null do update set appointment_id = excluded.appointment_id
  returning id into target_record_id;
  return target_record_id;
end; $$;

create or replace function public.finalize_clinical_encounter(target_appointment_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  target_record public.medical_records%rowtype;
begin
  select appointment.* into source
  from public.appointments appointment
  join public.profiles profile on profile.id = current_user_id and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member on member.clinic_id = appointment.clinic_id and member.user_id = current_user_id and member.status = 'active'
  where appointment.id = target_appointment_id for update of appointment;
  if source.id is null then raise exception using errcode = '42501', message = 'Consulta não encontrada na clínica ativa.'; end if;
  if source.professional_id <> current_user_id then raise exception using errcode = '42501', message = 'Somente o profissional responsável pode finalizar o atendimento.'; end if;
  if source.status = 'completed' then
    select * into target_record from public.medical_records where appointment_id = source.id and deleted_at is null;
    return target_record.id;
  end if;
  if source.status <> 'in_progress' then raise exception using errcode = '22023', message = 'A consulta precisa estar em atendimento para ser finalizada.'; end if;
  select * into target_record from public.medical_records where appointment_id = source.id and deleted_at is null for update;
  if target_record.id is null then raise exception using errcode = '23514', message = 'Salve o prontuário antes de finalizar.'; end if;
  if nullif(trim(target_record.chief_complaint), '') is null or nullif(trim(target_record.assessment), '') is null or nullif(trim(target_record.plan), '') is null then
    raise exception using errcode = '23514', message = 'Preencha motivo da consulta, avaliação e conduta antes de finalizar.';
  end if;
  update public.medical_records set status = 'finalized', finalized_at = now(), finalized_by = current_user_id, last_saved_at = now(), updated_at = now() where id = target_record.id;
  update public.appointments set status = 'completed', completed_at = now(), completed_by = current_user_id, updated_at = now() where id = source.id;
  return target_record.id;
end; $$;

create or replace function public.protect_finalized_medical_record()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status in ('finalized', 'amended') then
    raise exception using errcode = '42501', message = 'Prontuário finalizado não pode ser alterado. Registre um adendo administrativo.';
  end if;
  new.last_saved_at := now();
  return new;
end; $$;
drop trigger if exists medical_records_protect_finalized on public.medical_records;
create trigger medical_records_protect_finalized before update on public.medical_records
for each row execute function public.protect_finalized_medical_record();

create or replace function public.create_medical_record_addendum(target_record_id uuid, addendum_content text, addendum_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  source public.medical_records%rowtype;
  new_id uuid;
begin
  select * into source from public.medical_records where id = target_record_id and deleted_at is null;
  if source.id is null or source.status not in ('finalized', 'amended') then raise exception using errcode = '22023', message = 'Apenas prontuários finalizados aceitam adendos.'; end if;
  if not exists (select 1 from public.profiles profile join public.clinic_members member on member.clinic_id = profile.active_clinic_id and member.user_id = current_user_id and member.status = 'active' and member.role = 'clinic_admin' where profile.id = current_user_id and profile.active_clinic_id = source.clinic_id) then
    raise exception using errcode = '42501', message = 'Somente administradores da clínica podem registrar adendos.';
  end if;
  if nullif(trim(addendum_content), '') is null or nullif(trim(addendum_reason), '') is null then raise exception using errcode = '23514', message = 'Informe o conteúdo e o motivo do adendo.'; end if;
  insert into public.medical_record_addenda (medical_record_id, clinic_id, content, reason, created_by)
  values (source.id, source.clinic_id, trim(addendum_content), trim(addendum_reason), current_user_id) returning id into new_id;
  return new_id;
end; $$;

alter table public.medical_record_addenda enable row level security;
drop policy if exists "Clinic members view medical record addenda" on public.medical_record_addenda;
drop policy if exists "Clinic admins create medical record addenda" on public.medical_record_addenda;
create policy "Clinic members view medical record addenda" on public.medical_record_addenda for select to authenticated
using (public.can_access_medical_record_clinic(clinic_id));
create policy "Clinic admins create medical record addenda" on public.medical_record_addenda for insert to authenticated
with check (created_by = auth.uid() and exists (select 1 from public.clinic_members where clinic_id = medical_record_addenda.clinic_id and user_id = auth.uid() and status = 'active' and role = 'clinic_admin'));

revoke all on function public.start_clinical_encounter(uuid) from public;
revoke all on function public.finalize_clinical_encounter(uuid) from public;
revoke all on function public.create_medical_record_addendum(uuid, text, text) from public;
grant execute on function public.start_clinical_encounter(uuid) to authenticated;
grant execute on function public.finalize_clinical_encounter(uuid) to authenticated;
grant execute on function public.create_medical_record_addendum(uuid, text, text) to authenticated;
grant select on public.medical_record_addenda to authenticated;

commit;
select pg_notify('pgrst', 'reload schema');
