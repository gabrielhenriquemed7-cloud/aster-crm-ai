begin;

do $$ begin
  create type public.appointment_status_v1 as enum (
    'scheduled', 'confirmed', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appointment_type_v1 as enum (
    'consultation', 'return', 'procedure', 'teleconsultation', 'exam', 'other'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid,
  patient_id uuid,
  professional_id uuid,
  title text,
  appointment_date date,
  start_time time without time zone,
  end_time time without time zone,
  appointment_type public.appointment_type_v1 not null default 'consultation',
  status public.appointment_status_v1 not null default 'scheduled',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text
);

alter table public.appointments add column if not exists clinic_id uuid;
alter table public.appointments add column if not exists patient_id uuid;
alter table public.appointments add column if not exists professional_id uuid;
alter table public.appointments add column if not exists title text;
alter table public.appointments add column if not exists appointment_date date;
alter table public.appointments add column if not exists start_time time without time zone;
alter table public.appointments add column if not exists end_time time without time zone;
alter table public.appointments add column if not exists created_by uuid default auth.uid();
alter table public.appointments add column if not exists cancelled_at timestamptz;
alter table public.appointments add column if not exists cancellation_reason text;
alter table public.appointments add column if not exists notes text;
alter table public.appointments add column if not exists created_at timestamptz default now();
alter table public.appointments add column if not exists updated_at timestamptz default now();

-- Convert the legacy enum/text columns once, without losing their values.
do $$ begin
  if (select udt_name from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'status') <> 'appointment_status_v1' then
    alter table public.appointments alter column status drop default;
    alter table public.appointments alter column status type public.appointment_status_v1 using (
      case status::text when 'scheduled' then 'scheduled' when 'confirmed' then 'confirmed' when 'waiting' then 'waiting'
        when 'in_progress' then 'in_progress' when 'completed' then 'completed' when 'cancelled' then 'cancelled'
        when 'no_show' then 'no_show' else 'scheduled' end
    )::public.appointment_status_v1;
    alter table public.appointments alter column status set default 'scheduled';
  end if;
end $$;

do $$ begin
  if (select udt_name from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'appointment_type') <> 'appointment_type_v1' then
    alter table public.appointments alter column appointment_type drop default;
    alter table public.appointments alter column appointment_type type public.appointment_type_v1 using (
      case lower(trim(appointment_type::text)) when 'consultation' then 'consultation' when 'consulta' then 'consultation'
        when 'return' then 'return' when 'retorno' then 'return' when 'procedure' then 'procedure'
        when 'procedimento' then 'procedure' when 'teleconsultation' then 'teleconsultation'
        when 'teleconsulta' then 'teleconsultation' when 'exam' then 'exam' when 'exame' then 'exam' else 'other' end
    )::public.appointment_type_v1;
    alter table public.appointments alter column appointment_type set default 'consultation';
  end if;
end $$;

-- Backfill records created by the legacy agenda.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'doctor_id') then
    execute 'update public.appointments set professional_id = doctor_id where professional_id is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'user_id') then
    execute 'update public.appointments set created_by = user_id where created_by is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'starts_at') then
    execute $sql$
      update public.appointments set
        appointment_date = (starts_at at time zone 'America/Bahia')::date,
        start_time = (starts_at at time zone 'America/Bahia')::time,
        end_time = (ends_at at time zone 'America/Bahia')::time
      where appointment_date is null or start_time is null or end_time is null
    $sql$;
  end if;
end $$;

update public.appointments
set title = coalesce(nullif(title, ''), 'Consulta')
where title is null or trim(title) = '';

update public.appointments
set clinic_id = patient.clinic_id
from public.patients patient
where patient.id = appointments.patient_id
  and appointments.clinic_id is null;

update public.appointments
set cancelled_at = coalesce(cancelled_at, updated_at, now())
where status = 'cancelled' and cancelled_at is null;

create index if not exists appointments_clinic_date_idx
  on public.appointments(clinic_id, appointment_date, start_time);
create index if not exists appointments_professional_schedule_idx
  on public.appointments(clinic_id, professional_id, appointment_date, start_time, end_time);
create index if not exists appointments_patient_idx
  on public.appointments(clinic_id, patient_id, appointment_date);
create index if not exists appointments_status_idx
  on public.appointments(clinic_id, status, appointment_date);

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_clinic_id_fkey') then
    alter table public.appointments add constraint appointments_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_patient_id_fkey') then
    alter table public.appointments add constraint appointments_patient_id_fkey foreign key (patient_id) references public.patients(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_professional_id_fkey') then
    alter table public.appointments add constraint appointments_professional_id_fkey foreign key (professional_id) references auth.users(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_created_by_fkey') then
    alter table public.appointments add constraint appointments_created_by_fkey foreign key (created_by) references auth.users(id) on delete restrict not valid;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_required_fields') then
    alter table public.appointments add constraint appointments_required_fields check (
      clinic_id is not null and patient_id is not null and professional_id is not null and
      title is not null and appointment_date is not null and start_time is not null and
      end_time is not null and created_by is not null
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_valid_time') then
    alter table public.appointments add constraint appointments_valid_time check (end_time > start_time) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_cancellation_reason_required') then
    alter table public.appointments add constraint appointments_cancellation_reason_required check (
      status <> 'cancelled' or (cancellation_reason is not null and trim(cancellation_reason) <> '')
    ) not valid;
  end if;
end $$;

create or replace function public.enforce_appointment_tenant_and_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_clinic_id uuid;
begin
  select profile.active_clinic_id into current_clinic_id
  from public.profiles profile
  join public.clinic_members member
    on member.clinic_id = profile.active_clinic_id
   and member.user_id = profile.id
   and member.status = 'active'
  where profile.id = current_user_id;

  if current_user_id is null or current_clinic_id is null then
    raise exception using errcode = '42501', message = 'Selecione uma clínica com vínculo ativo.';
  end if;

  if tg_op = 'INSERT' then
    new.clinic_id := current_clinic_id;
    new.created_by := current_user_id;
  elsif new.clinic_id is distinct from old.clinic_id or new.created_by is distinct from old.created_by then
    raise exception using errcode = '42501', message = 'Clínica e autoria da consulta não podem ser alteradas.';
  end if;

  if new.clinic_id <> current_clinic_id then
    raise exception using errcode = '42501', message = 'A consulta deve pertencer à clínica ativa.';
  end if;
  if not exists (select 1 from public.patients where id = new.patient_id and clinic_id = current_clinic_id and deleted_at is null) then
    raise exception using errcode = '42501', message = 'Paciente não pertence à clínica ativa.';
  end if;
  if not exists (select 1 from public.clinic_members where clinic_id = current_clinic_id and user_id = new.professional_id and status = 'active' and role in ('clinic_admin', 'doctor')) then
    raise exception using errcode = '42501', message = 'Profissional não pertence à clínica ativa.';
  end if;
  if new.end_time <= new.start_time then
    raise exception using errcode = '23514', message = 'O horário final deve ser posterior ao inicial.';
  end if;
  if new.status = 'cancelled' then
    if nullif(trim(new.cancellation_reason), '') is null then
      raise exception using errcode = '23514', message = 'Informe o motivo do cancelamento.';
    end if;
    new.cancelled_at := coalesce(new.cancelled_at, now());
  else
    new.cancelled_at := null;
    new.cancellation_reason := null;
  end if;

  if new.status not in ('cancelled', 'no_show') and exists (
    select 1 from public.appointments existing
    where existing.clinic_id = current_clinic_id
      and existing.professional_id = new.professional_id
      and existing.appointment_date = new.appointment_date
      and existing.status not in ('cancelled', 'no_show')
      and existing.id <> new.id
      and new.start_time < existing.end_time
      and new.end_time > existing.start_time
  ) then
    raise exception using errcode = '23P01', message = 'Conflito de horário: o profissional já possui uma consulta neste período.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists appointments_enforce_tenant_and_conflict on public.appointments;
drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_enforce_tenant_and_conflict
before insert or update on public.appointments
for each row execute function public.enforce_appointment_tenant_and_conflict();

create or replace function public.is_active_clinic_member(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members member
    where member.user_id = auth.uid()
      and member.clinic_id = target_clinic_id
      and member.status = 'active'
  );
$$;

revoke all on function public.is_active_clinic_member(uuid) from public;
grant execute on function public.is_active_clinic_member(uuid) to authenticated;

alter table public.appointments enable row level security;
drop policy if exists "Users manage their own appointments" on public.appointments;
drop policy if exists "Clinic isolation for appointments" on public.appointments;
drop policy if exists "Active clinic members select appointments" on public.appointments;
drop policy if exists "Active clinic members insert appointments" on public.appointments;
drop policy if exists "Active clinic members update appointments" on public.appointments;
drop policy if exists "Active clinic members delete appointments" on public.appointments;

create policy "Active clinic members select appointments" on public.appointments for select to authenticated
using (public.is_active_clinic_member(clinic_id));
create policy "Active clinic members insert appointments" on public.appointments for insert to authenticated
with check (public.is_active_clinic_member(clinic_id) and created_by = auth.uid());
create policy "Active clinic members update appointments" on public.appointments for update to authenticated
using (public.is_active_clinic_member(clinic_id)) with check (public.is_active_clinic_member(clinic_id));
create policy "Active clinic members delete appointments" on public.appointments for delete to authenticated
using (public.is_active_clinic_member(clinic_id));

grant select, insert, update, delete on public.appointments to authenticated;
commit;
