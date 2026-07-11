begin;

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  patient_id uuid not null,
  appointment_id uuid not null,
  professional_id uuid not null,
  chief_complaint text,
  hpi text,
  pmh text,
  medications text,
  allergies text,
  family_history text,
  social_history text,
  physical_exam text,
  assessment text,
  cid10 text,
  plan text,
  prescription text,
  exam_requests text,
  certificate text,
  return_guidance text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.medical_records add column if not exists clinic_id uuid;
alter table public.medical_records add column if not exists patient_id uuid;
alter table public.medical_records add column if not exists appointment_id uuid;
alter table public.medical_records add column if not exists professional_id uuid;
alter table public.medical_records add column if not exists chief_complaint text;
alter table public.medical_records add column if not exists hpi text;
alter table public.medical_records add column if not exists pmh text;
alter table public.medical_records add column if not exists medications text;
alter table public.medical_records add column if not exists allergies text;
alter table public.medical_records add column if not exists family_history text;
alter table public.medical_records add column if not exists social_history text;
alter table public.medical_records add column if not exists physical_exam text;
alter table public.medical_records add column if not exists assessment text;
alter table public.medical_records add column if not exists cid10 text;
alter table public.medical_records add column if not exists plan text;
alter table public.medical_records add column if not exists prescription text;
alter table public.medical_records add column if not exists exam_requests text;
alter table public.medical_records add column if not exists certificate text;
alter table public.medical_records add column if not exists return_guidance text;
alter table public.medical_records add column if not exists created_at timestamptz default now();
alter table public.medical_records add column if not exists updated_at timestamptz default now();
alter table public.medical_records add column if not exists deleted_at timestamptz;

create unique index if not exists medical_records_active_appointment_uidx
  on public.medical_records (appointment_id)
  where deleted_at is null;
create index if not exists medical_records_clinic_patient_idx
  on public.medical_records (clinic_id, patient_id, created_at desc);
create index if not exists medical_records_clinic_professional_idx
  on public.medical_records (clinic_id, professional_id, created_at desc);
create index if not exists medical_records_clinic_created_idx
  on public.medical_records (clinic_id, created_at desc)
  where deleted_at is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.medical_records'::regclass and conname = 'medical_records_clinic_id_fkey') then
    alter table public.medical_records add constraint medical_records_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.medical_records'::regclass and conname = 'medical_records_patient_id_fkey') then
    alter table public.medical_records add constraint medical_records_patient_id_fkey foreign key (patient_id) references public.patients(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.medical_records'::regclass and conname = 'medical_records_appointment_id_fkey') then
    alter table public.medical_records add constraint medical_records_appointment_id_fkey foreign key (appointment_id) references public.appointments(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.medical_records'::regclass and conname = 'medical_records_professional_id_fkey') then
    alter table public.medical_records add constraint medical_records_professional_id_fkey foreign key (professional_id) references auth.users(id) on delete restrict not valid;
  end if;
end $$;

create or replace function public.can_access_medical_record_clinic(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.clinic_members member
      on member.clinic_id = profile.active_clinic_id
     and member.user_id = profile.id
     and member.status = 'active'
    where profile.id = auth.uid()
      and profile.active_clinic_id = target_clinic_id
  );
$$;

create or replace function public.enforce_medical_record_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  source_appointment public.appointments%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Você precisa estar autenticado para acessar o prontuário.';
  end if;

  select appointment.* into source_appointment
  from public.appointments appointment
  join public.profiles profile
    on profile.id = current_user_id
   and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member
    on member.clinic_id = appointment.clinic_id
   and member.user_id = current_user_id
   and member.status = 'active'
  where appointment.id = new.appointment_id;

  if source_appointment.id is null then
    raise exception using errcode = '42501', message = 'A consulta não pertence à clínica ativa.';
  end if;
  if source_appointment.professional_id <> current_user_id then
    raise exception using errcode = '42501', message = 'Somente o profissional da consulta pode registrar o prontuário.';
  end if;

  if tg_op = 'INSERT' then
    new.clinic_id := source_appointment.clinic_id;
    new.patient_id := source_appointment.patient_id;
    new.professional_id := source_appointment.professional_id;
  elsif new.clinic_id is distinct from old.clinic_id
     or new.patient_id is distinct from old.patient_id
     or new.appointment_id is distinct from old.appointment_id
     or new.professional_id is distinct from old.professional_id then
    raise exception using errcode = '42501', message = 'Os vínculos do prontuário não podem ser alterados.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists medical_records_enforce_tenant on public.medical_records;
create trigger medical_records_enforce_tenant
before insert or update on public.medical_records
for each row execute function public.enforce_medical_record_tenant();

alter table public.medical_records enable row level security;
drop policy if exists "Active clinic members select medical records" on public.medical_records;
drop policy if exists "Assigned professionals insert medical records" on public.medical_records;
drop policy if exists "Assigned professionals update medical records" on public.medical_records;

create policy "Active clinic members select medical records"
  on public.medical_records for select to authenticated
  using (public.can_access_medical_record_clinic(clinic_id) and deleted_at is null);
create policy "Assigned professionals insert medical records"
  on public.medical_records for insert to authenticated
  with check (
    public.can_access_medical_record_clinic(clinic_id)
    and professional_id = auth.uid()
    and deleted_at is null
  );
create policy "Assigned professionals update medical records"
  on public.medical_records for update to authenticated
  using (
    public.can_access_medical_record_clinic(clinic_id)
    and professional_id = auth.uid()
    and deleted_at is null
  )
  with check (
    public.can_access_medical_record_clinic(clinic_id)
    and professional_id = auth.uid()
  );

revoke all on function public.can_access_medical_record_clinic(uuid) from public;
grant execute on function public.can_access_medical_record_clinic(uuid) to authenticated;
grant select, insert, update on public.medical_records to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
