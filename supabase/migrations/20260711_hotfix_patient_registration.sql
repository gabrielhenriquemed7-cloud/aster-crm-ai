begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid,
  user_id uuid not null default auth.uid(),
  created_by uuid default auth.uid(),
  full_name text not null,
  cpf text,
  cns text,
  birth_date date,
  gender text,
  marital_status text,
  occupation text,
  zip_code text,
  address text,
  city text,
  state text,
  phone text,
  whatsapp text,
  email text,
  insurance text,
  insurance_card text,
  emergency_contact text,
  allergies text,
  comorbidities text,
  notes text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patients add column if not exists clinic_id uuid;
alter table public.patients add column if not exists user_id uuid default auth.uid();
alter table public.patients add column if not exists created_by uuid default auth.uid();
alter table public.patients add column if not exists full_name text;
alter table public.patients add column if not exists social_name text;
alter table public.patients add column if not exists cpf text;
alter table public.patients add column if not exists rg text;
alter table public.patients add column if not exists cns text;
alter table public.patients add column if not exists birth_date date;
alter table public.patients add column if not exists gender text;
alter table public.patients add column if not exists race_ethnicity text;
alter table public.patients add column if not exists marital_status text;
alter table public.patients add column if not exists nationality text;
alter table public.patients add column if not exists birthplace text;
alter table public.patients add column if not exists mother_name text;
alter table public.patients add column if not exists father_name text;
alter table public.patients add column if not exists occupation text;
alter table public.patients add column if not exists zip_code text;
alter table public.patients add column if not exists address text;
alter table public.patients add column if not exists address_number text;
alter table public.patients add column if not exists address_complement text;
alter table public.patients add column if not exists neighborhood text;
alter table public.patients add column if not exists city text;
alter table public.patients add column if not exists state text;
alter table public.patients add column if not exists phone text;
alter table public.patients add column if not exists whatsapp text;
alter table public.patients add column if not exists email text;
alter table public.patients add column if not exists insurance text;
alter table public.patients add column if not exists insurance_card text;
alter table public.patients add column if not exists emergency_contact text;
alter table public.patients add column if not exists emergency_contact_name text;
alter table public.patients add column if not exists emergency_contact_phone text;
alter table public.patients add column if not exists emergency_contact_relationship text;
alter table public.patients add column if not exists blood_type text;
alter table public.patients add column if not exists allergies text;
alter table public.patients add column if not exists comorbidities text;
alter table public.patients add column if not exists continuous_medications text;
alter table public.patients add column if not exists medical_history text;
alter table public.patients add column if not exists notes text;
alter table public.patients add column if not exists photo_url text;
alter table public.patients add column if not exists created_at timestamptz default now();
alter table public.patients add column if not exists updated_at timestamptz default now();
alter table public.patients add column if not exists deleted_at timestamptz;
alter table public.patients add column if not exists deleted_by uuid;

update public.patients
set emergency_contact_name = emergency_contact
where emergency_contact_name is null
  and emergency_contact is not null;

update public.patients
set created_by = user_id
where created_by is null;

update public.patients patient
set clinic_id = coalesce(
  (
    select profile.active_clinic_id
    from public.profiles profile
    where profile.id = patient.user_id
  ),
  (
    select member.clinic_id
    from public.clinic_members member
    where member.user_id = patient.user_id
      and member.status = 'active'
    order by member.created_at, member.id
    limit 1
  )
)
where patient.clinic_id is null;

create index if not exists patients_user_id_idx
  on public.patients(user_id);

create index if not exists patients_created_by_idx
  on public.patients(created_by);

create index if not exists patients_clinic_idx
  on public.patients(clinic_id, full_name);

create index if not exists patients_clinic_cpf_idx
  on public.patients(clinic_id, cpf);

create index if not exists patients_active_clinic_name_idx
  on public.patients(clinic_id, full_name)
  where deleted_at is null;

create index if not exists patients_active_clinic_cpf_idx
  on public.patients(clinic_id, cpf)
  where deleted_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_clinic_id_fkey'
  ) then
    alter table public.patients
      add constraint patients_clinic_id_fkey
      foreign key (clinic_id)
      references public.clinics(id)
      on delete restrict
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_deleted_by_fkey'
  ) then
    alter table public.patients
      add constraint patients_deleted_by_fkey
      foreign key (deleted_by)
      references auth.users(id)
      on delete set null
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_user_id_fkey'
  ) then
    alter table public.patients
      add constraint patients_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete restrict
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_created_by_fkey'
  ) then
    alter table public.patients
      add constraint patients_created_by_fkey
      foreign key (created_by)
      references auth.users(id)
      on delete restrict
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_clinic_id_required'
  ) then
    alter table public.patients
      add constraint patients_clinic_id_required
      check (clinic_id is not null)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_created_by_required'
  ) then
    alter table public.patients
      add constraint patients_created_by_required
      check (created_by is not null)
      not valid;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.clinics') is null
     or to_regclass('public.clinic_members') is null then
    raise exception 'Execute primeiro o hotfix de onboarding da clínica.';
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.can_access_patient_clinic(target_clinic_id uuid)
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

create or replace function public.enforce_patient_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_clinic_id uuid;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Você precisa estar autenticado para cadastrar pacientes.';
  end if;

  if tg_op = 'INSERT' then
    select profile.active_clinic_id
    into current_clinic_id
    from public.profiles profile
    join public.clinic_members member
      on member.clinic_id = profile.active_clinic_id
     and member.user_id = profile.id
     and member.status = 'active'
    where profile.id = current_user_id;

    if current_clinic_id is null then
      raise exception using
        errcode = '42501',
        message = 'O usuário não possui vínculo ativo com a clínica selecionada.';
    end if;

    new.clinic_id := current_clinic_id;
    new.user_id := current_user_id;
    new.created_by := current_user_id;
    return new;
  end if;

  if new.clinic_id is distinct from old.clinic_id
     or new.user_id is distinct from old.user_id
     or new.created_by is distinct from old.created_by then
    raise exception using
      errcode = '42501',
      message = 'Clínica e autoria do paciente não podem ser alteradas.';
  end if;

  return new;
end;
$$;

drop trigger if exists patients_enforce_tenant on public.patients;
drop trigger if exists patients_set_updated_at on public.patients;

create trigger patients_enforce_tenant
before insert or update on public.patients
for each row
execute function public.enforce_patient_tenant();

create trigger patients_set_updated_at
before update on public.patients
for each row
execute function public.set_updated_at();

alter table public.patients enable row level security;

drop policy if exists "Users manage their own patients" on public.patients;
drop policy if exists "Clinic isolation for patients" on public.patients;
drop policy if exists "Active clinic members insert patients" on public.patients;
drop policy if exists "Active clinic members select patients" on public.patients;
drop policy if exists "Active clinic members update patients" on public.patients;
drop policy if exists "Active clinic members delete patients" on public.patients;

create policy "Active clinic members insert patients"
  on public.patients
  for insert
  to authenticated
  with check (
    public.can_access_patient_clinic(clinic_id)
    and user_id = auth.uid()
    and created_by = auth.uid()
  );

create policy "Active clinic members select patients"
  on public.patients
  for select
  to authenticated
  using (public.can_access_patient_clinic(clinic_id));

create policy "Active clinic members update patients"
  on public.patients
  for update
  to authenticated
  using (public.can_access_patient_clinic(clinic_id))
  with check (public.can_access_patient_clinic(clinic_id));

create policy "Active clinic members delete patients"
  on public.patients
  for delete
  to authenticated
  using (public.can_access_patient_clinic(clinic_id));

revoke all on function public.can_access_patient_clinic(uuid) from public;
grant execute on function public.can_access_patient_clinic(uuid) to authenticated;

grant select, insert, update, delete on public.patients to authenticated;

commit;
