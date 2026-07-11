begin;

-- Extensions
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Enums
do $$ begin
  create type public.user_role as enum ('administrator', 'doctor', 'secretary', 'receptionist');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appointment_status as enum ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clinic_status as enum ('active', 'inactive', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clinic_plan as enum ('starter', 'professional', 'enterprise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clinic_member_role as enum ('platform_admin', 'clinic_admin', 'doctor', 'secretary', 'receptionist');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clinic_member_status as enum ('active', 'inactive', 'invited');
exception when duplicate_object then null; end $$;

-- Tables
create table if not exists public.profiles (
  id uuid primary key,
  full_name text,
  email text,
  phone text,
  role public.user_role not null default 'receptionist',
  avatar_url text,
  active_clinic_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  cnpj text,
  email text,
  phone text,
  status public.clinic_status not null default 'active',
  plan public.clinic_plan not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinics_name_not_blank check (char_length(trim(name)) >= 3),
  constraint clinics_cnpj_length check (cnpj is null or length(regexp_replace(cnpj, '\D', '', 'g')) = 14)
);

create table if not exists public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  user_id uuid not null,
  role public.clinic_member_role not null default 'receptionist',
  status public.clinic_member_status not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_members_clinic_user_key unique (clinic_id, user_id)
);

create table if not exists public.clinic_audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  actor_id uuid,
  target_user_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.clinic_invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  email text not null,
  full_name text,
  role public.clinic_member_role not null,
  status text not null default 'pending',
  token uuid not null default gen_random_uuid(),
  created_by uuid not null,
  accepted_by uuid,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_invites_status_check check (status in ('pending', 'accepted', 'revoked', 'expired')),
  constraint clinic_invites_assignable_role check (role <> 'platform_admin'),
  constraint clinic_invites_email_not_blank check (char_length(trim(email)) > 3)
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  user_id uuid not null default auth.uid(),
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
  updated_at timestamptz not null default now(),
  constraint patients_name_not_blank check (char_length(trim(full_name)) >= 3),
  constraint patients_cpf_length check (cpf is null or length(regexp_replace(cpf, '\D', '', 'g')) = 11),
  constraint patients_cns_length check (cns is null or length(regexp_replace(cns, '\D', '', 'g')) = 15)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  user_id uuid not null default auth.uid(),
  patient_id uuid not null,
  doctor_id uuid not null default auth.uid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  appointment_type text not null default 'Consulta',
  notes text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_valid_interval check (ends_at > starts_at),
  constraint appointments_type_not_blank check (char_length(trim(appointment_type)) >= 2)
);

-- Indexes
create index if not exists profiles_active_clinic_idx on public.profiles(active_clinic_id);
create unique index if not exists clinics_cnpj_unique_idx on public.clinics(cnpj) where cnpj is not null;
create index if not exists clinic_members_user_idx on public.clinic_members(user_id, status);
create index if not exists clinic_members_clinic_idx on public.clinic_members(clinic_id, status);
create index if not exists clinic_audit_logs_clinic_created_idx on public.clinic_audit_logs(clinic_id, created_at desc);
create unique index if not exists clinic_invites_token_idx on public.clinic_invites(token);
create unique index if not exists clinic_invites_pending_email_idx on public.clinic_invites(clinic_id, lower(email)) where status = 'pending';
create index if not exists clinic_invites_clinic_status_idx on public.clinic_invites(clinic_id, status, created_at desc);
create index if not exists patients_user_id_idx on public.patients(user_id);
create index if not exists patients_full_name_idx on public.patients(clinic_id, full_name);
create index if not exists patients_cpf_idx on public.patients(clinic_id, cpf);
create index if not exists patients_clinic_idx on public.patients(clinic_id, full_name);
create index if not exists appointments_user_starts_at_idx on public.appointments(user_id, starts_at);
create index if not exists appointments_patient_id_idx on public.appointments(patient_id);
create index if not exists appointments_doctor_starts_at_idx on public.appointments(doctor_id, starts_at);
create index if not exists appointments_clinic_starts_idx on public.appointments(clinic_id, starts_at);

-- Foreign keys
do $$ begin
  alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_active_clinic_id_fkey foreign key (active_clinic_id) references public.clinics(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clinic_members add constraint clinic_members_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clinic_members add constraint clinic_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clinic_members add constraint clinic_members_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clinic_audit_logs add constraint clinic_audit_logs_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clinic_audit_logs add constraint clinic_audit_logs_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clinic_audit_logs add constraint clinic_audit_logs_target_user_id_fkey foreign key (target_user_id) references auth.users(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clinic_invites add constraint clinic_invites_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clinic_invites add constraint clinic_invites_created_by_fkey foreign key (created_by) references auth.users(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clinic_invites add constraint clinic_invites_accepted_by_fkey foreign key (accepted_by) references auth.users(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.patients add constraint patients_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.patients add constraint patients_user_id_fkey foreign key (user_id) references auth.users(id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.appointments add constraint appointments_clinic_id_fkey foreign key (clinic_id) references public.clinics(id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.appointments add constraint appointments_user_id_fkey foreign key (user_id) references auth.users(id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.appointments add constraint appointments_patient_id_fkey foreign key (patient_id) references public.patients(id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.appointments add constraint appointments_doctor_id_fkey foreign key (doctor_id) references auth.users(id) on delete restrict;
exception when duplicate_object then null; end $$;

-- Trigger functions and triggers
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.phone
  )
  on conflict (id) do update set
    email = excluded.email,
    phone = excluded.phone;
  return new;
end;
$$;

create or replace function public.protect_clinic_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_admins integer;
  removes_active_admin boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.clinic_id is distinct from old.clinic_id or new.user_id is distinct from old.user_id then
      raise exception using errcode = '42501', message = 'Clínica e usuário do vínculo não podem ser alterados.';
    end if;
    if new.role = 'platform_admin' and old.role <> 'platform_admin' then
      raise exception using errcode = '42501', message = 'Administrador da clínica não pode atribuir platform_admin.';
    end if;
    removes_active_admin := old.role = 'clinic_admin' and old.status = 'active'
      and (new.role <> 'clinic_admin' or new.status <> 'active');
  elsif tg_op = 'DELETE' then
    removes_active_admin := old.role = 'clinic_admin' and old.status = 'active';
  end if;

  if removes_active_admin then
    select count(*) into remaining_admins
    from public.clinic_members cm
    where cm.clinic_id = old.clinic_id
      and cm.role = 'clinic_admin'
      and cm.status = 'active'
      and cm.id <> old.id;
    if remaining_admins = 0 then
      raise exception using errcode = '23514', message = 'A clínica precisa manter pelo menos um administrador ativo.';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.validate_appointment_clinic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.patients p
    where p.id = new.patient_id and p.clinic_id = new.clinic_id
  ) then
    raise exception using errcode = '23514', message = 'O paciente não pertence à clínica da consulta.';
  end if;
  if not exists (
    select 1 from public.clinic_members cm
    where cm.clinic_id = new.clinic_id
      and cm.user_id = new.doctor_id
      and cm.status = 'active'
      and cm.role in ('clinic_admin', 'doctor')
  ) then
    raise exception using errcode = '23514', message = 'O médico não possui vínculo ativo com esta clínica.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists clinics_set_updated_at on public.clinics;
create trigger clinics_set_updated_at before update on public.clinics
for each row execute function public.set_updated_at();

drop trigger if exists clinic_members_set_updated_at on public.clinic_members;
create trigger clinic_members_set_updated_at before update on public.clinic_members
for each row execute function public.set_updated_at();

drop trigger if exists protect_clinic_membership_trigger on public.clinic_members;
create trigger protect_clinic_membership_trigger before update or delete on public.clinic_members
for each row execute function public.protect_clinic_membership();

drop trigger if exists clinic_invites_set_updated_at on public.clinic_invites;
create trigger clinic_invites_set_updated_at before update on public.clinic_invites
for each row execute function public.set_updated_at();

drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at before update on public.patients
for each row execute function public.set_updated_at();

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists appointments_validate_clinic on public.appointments;
create trigger appointments_validate_clinic before insert or update of clinic_id, patient_id, doctor_id on public.appointments
for each row execute function public.validate_appointment_clinic();

-- Helper and RPC functions
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinic_members
    where user_id = auth.uid() and role = 'platform_admin' and status = 'active'
  );
$$;

create or replace function public.active_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.active_clinic_id
  from public.profiles p
  join public.clinic_members cm
    on cm.clinic_id = p.active_clinic_id
   and cm.user_id = p.id
   and cm.status = 'active'
  where p.id = auth.uid();
$$;

create or replace function public.is_active_clinic_member(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.clinic_members cm
    where cm.user_id = auth.uid()
      and cm.clinic_id = target_clinic_id
      and cm.status = 'active'
      and target_clinic_id = public.active_clinic_id()
  );
$$;

create or replace function public.is_active_clinic_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.clinic_members cm
    where cm.user_id = auth.uid()
      and cm.clinic_id = public.active_clinic_id()
      and cm.status = 'active'
      and cm.role = 'clinic_admin'
  );
$$;

create or replace function public.current_clinic_admin_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.clinic_id
  from public.profiles p
  join public.clinic_members cm
    on cm.clinic_id = p.active_clinic_id
   and cm.user_id = p.id
   and cm.status = 'active'
   and cm.role = 'clinic_admin'
  where p.id = auth.uid();
$$;

create or replace function public.can_read_active_clinic_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.clinic_members caller
    join public.clinic_members target on target.clinic_id = caller.clinic_id
    join public.profiles p on p.active_clinic_id = caller.clinic_id and p.id = caller.user_id
    where caller.user_id = auth.uid()
      and caller.status = 'active'
      and target.user_id = target_user_id
      and target.status = 'active'
  );
$$;

create or replace function public.can_update_own_profile(target_role public.user_role, target_active_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = target_role
      and p.active_clinic_id is not distinct from target_active_clinic_id
  );
$$;

create or replace function public.set_active_clinic(target_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_role public.clinic_member_role;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Você precisa estar autenticado.';
  end if;
  select role into selected_role
  from public.clinic_members
  where user_id = auth.uid() and clinic_id = target_clinic_id and status = 'active';
  if selected_role is null then
    raise exception using errcode = '42501', message = 'Sem vínculo ativo com esta clínica.';
  end if;
  update public.profiles
  set active_clinic_id = target_clinic_id,
      role = case selected_role
        when 'clinic_admin' then 'administrator'::public.user_role
        when 'doctor' then 'doctor'::public.user_role
        when 'secretary' then 'secretary'::public.user_role
        else 'receptionist'::public.user_role
      end
  where id = auth.uid();
end;
$$;

create or replace function public.create_clinic_with_owner(
  clinic_name text,
  clinic_legal_name text default null,
  clinic_cnpj text default null,
  clinic_email text default null,
  clinic_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_clinic_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Você precisa estar autenticado para criar uma clínica.';
  end if;
  if coalesce(trim(clinic_name), '') = '' or char_length(trim(clinic_name)) < 3 then
    raise exception using errcode = '22023', message = 'Informe um nome de clínica com pelo menos 3 caracteres.';
  end if;
  if exists (
    select 1 from public.clinic_members where user_id = current_user_id and status = 'active'
  ) and not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Usuários já vinculados a uma clínica não podem criar outra clínica.';
  end if;

  insert into public.profiles (id, full_name, email)
  select id, coalesce(raw_user_meta_data ->> 'full_name', ''), email
  from auth.users where id = current_user_id
  on conflict (id) do update set email = coalesce(public.profiles.email, excluded.email);

  insert into public.clinics (name, legal_name, cnpj, email, phone, status, plan)
  values (
    trim(clinic_name),
    nullif(trim(coalesce(clinic_legal_name, '')), ''),
    nullif(regexp_replace(coalesce(clinic_cnpj, ''), '\D', '', 'g'), ''),
    nullif(lower(trim(coalesce(clinic_email, ''))), ''),
    nullif(trim(coalesce(clinic_phone, '')), ''),
    'active',
    'starter'
  ) returning id into new_clinic_id;

  insert into public.clinic_members (clinic_id, user_id, role, status, created_by)
  values (new_clinic_id, current_user_id, 'clinic_admin', 'active', current_user_id);

  update public.profiles
  set active_clinic_id = new_clinic_id, role = 'administrator'
  where id = current_user_id;

  insert into public.clinic_audit_logs (clinic_id, actor_id, target_user_id, event_type, metadata)
  values (new_clinic_id, current_user_id, current_user_id, 'clinic_created', jsonb_build_object('source', 'onboarding'));

  return new_clinic_id;
end;
$$;

create or replace function public.list_active_clinic_team()
returns table (
  record_type text,
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  role public.clinic_member_role,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para administrar esta clínica.';
  end if;
  return query
  select
    'member'::text, cm.id, cm.user_id,
    coalesce(nullif(p.full_name, ''), u.raw_user_meta_data ->> 'full_name'),
    coalesce(p.email, u.email)::text, cm.role, cm.status::text, cm.created_at, null::timestamptz
  from public.clinic_members cm
  left join public.profiles p on p.id = cm.user_id
  left join auth.users u on u.id = cm.user_id
  where cm.clinic_id = selected_clinic_id
  union all
  select
    'invite'::text, ci.id, null::uuid, ci.full_name, ci.email, ci.role,
    case when ci.status = 'pending' and ci.expires_at <= now() then 'expired' else ci.status end,
    ci.created_at, ci.expires_at
  from public.clinic_invites ci
  where ci.clinic_id = selected_clinic_id
    and ci.status = 'pending'
    and not exists (
      select 1 from public.clinic_members cm
      join auth.users u on u.id = cm.user_id
      where cm.clinic_id = selected_clinic_id and lower(u.email) = lower(ci.email)
    )
  order by created_at;
end;
$$;

create or replace function public.create_clinic_invite(invite_email text, invite_full_name text, invite_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  normalized_email text := lower(trim(invite_email));
  selected_role public.clinic_member_role;
  invite_id uuid;
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para convidar usuários nesta clínica.';
  end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = '22023', message = 'Informe um e-mail válido.';
  end if;
  if invite_role not in ('clinic_admin', 'doctor', 'secretary', 'receptionist') then
    raise exception using errcode = '42501', message = 'Papel inválido para um usuário da clínica.';
  end if;
  selected_role := invite_role::public.clinic_member_role;
  if exists (
    select 1 from public.clinic_members cm join auth.users u on u.id = cm.user_id
    where cm.clinic_id = selected_clinic_id and lower(u.email) = normalized_email
  ) then
    raise exception using errcode = '23505', message = 'Este usuário já está vinculado à clínica.';
  end if;

  update public.clinic_invites set status = 'expired'
  where clinic_id = selected_clinic_id and lower(email) = normalized_email
    and status = 'pending' and expires_at <= now();

  insert into public.clinic_invites (clinic_id, email, full_name, role, created_by)
  values (selected_clinic_id, normalized_email, nullif(trim(coalesce(invite_full_name, '')), ''), selected_role, auth.uid())
  on conflict (clinic_id, (lower(email))) where status = 'pending'
  do update set
    full_name = excluded.full_name,
    role = excluded.role,
    created_by = auth.uid(),
    token = gen_random_uuid(),
    expires_at = now() + interval '7 days',
    updated_at = now()
  returning id into invite_id;

  insert into public.clinic_audit_logs (clinic_id, actor_id, event_type, metadata)
  values (selected_clinic_id, auth.uid(), 'member_invited', jsonb_build_object('email', normalized_email, 'role', selected_role));
  return invite_id;
end;
$$;

create or replace function public.accept_my_clinic_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  accepted_count integer := 0;
  selected_invite public.clinic_invites%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Você precisa estar autenticado para aceitar o convite.';
  end if;
  select lower(email) into current_email from auth.users where id = current_user_id;

  for selected_invite in
    select * from public.clinic_invites
    where lower(email) = current_email and status = 'pending' and expires_at > now()
    order by created_at for update
  loop
    insert into public.clinic_members (clinic_id, user_id, role, status, created_by)
    values (selected_invite.clinic_id, current_user_id, selected_invite.role, 'active', selected_invite.created_by)
    on conflict (clinic_id, user_id) do update
      set role = excluded.role, status = 'active', created_by = excluded.created_by;

    update public.clinic_invites
    set status = 'accepted', accepted_by = current_user_id, accepted_at = now()
    where id = selected_invite.id;

    update public.profiles
    set active_clinic_id = coalesce(active_clinic_id, selected_invite.clinic_id),
        full_name = coalesce(nullif(full_name, ''), selected_invite.full_name),
        role = case selected_invite.role
          when 'clinic_admin' then 'administrator'::public.user_role
          when 'doctor' then 'doctor'::public.user_role
          when 'secretary' then 'secretary'::public.user_role
          else 'receptionist'::public.user_role
        end
    where id = current_user_id;

    insert into public.clinic_audit_logs (clinic_id, actor_id, target_user_id, event_type, metadata)
    values (selected_invite.clinic_id, current_user_id, current_user_id, 'invite_accepted', jsonb_build_object('invite_id', selected_invite.id));
    accepted_count := accepted_count + 1;
  end loop;

  update public.clinic_invites set status = 'expired'
  where lower(email) = current_email and status = 'pending' and expires_at <= now();
  return accepted_count;
end;
$$;

create or replace function public.update_active_clinic_member(
  member_id uuid,
  member_role text default null,
  member_status text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  target public.clinic_members%rowtype;
  resulting_role public.clinic_member_role;
  resulting_status public.clinic_member_status;
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para alterar usuários nesta clínica.';
  end if;
  select * into target from public.clinic_members
  where id = member_id and clinic_id = selected_clinic_id for update;
  if not found or target.role = 'platform_admin' then
    raise exception using errcode = '42501', message = 'Vínculo não encontrado nesta clínica.';
  end if;
  if member_role is not null and member_role not in ('clinic_admin', 'doctor', 'secretary', 'receptionist') then
    raise exception using errcode = '42501', message = 'Papel inválido para um usuário da clínica.';
  end if;
  if member_status is not null and member_status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'Status inválido para o vínculo.';
  end if;

  resulting_role := coalesce(member_role::public.clinic_member_role, target.role);
  resulting_status := coalesce(member_status::public.clinic_member_status, target.status);
  update public.clinic_members set role = resulting_role, status = resulting_status where id = member_id;

  if exists (select 1 from public.profiles where id = target.user_id and active_clinic_id = selected_clinic_id) then
    update public.profiles set role = case resulting_role
      when 'clinic_admin' then 'administrator'::public.user_role
      when 'doctor' then 'doctor'::public.user_role
      when 'secretary' then 'secretary'::public.user_role
      else 'receptionist'::public.user_role
    end where id = target.user_id;
  end if;

  insert into public.clinic_audit_logs (clinic_id, actor_id, target_user_id, event_type, metadata)
  values (selected_clinic_id, auth.uid(), target.user_id, 'member_updated',
    jsonb_strip_nulls(jsonb_build_object('role', member_role, 'status', member_status)));
end;
$$;

create or replace function public.remove_active_clinic_member(member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  target public.clinic_members%rowtype;
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para remover usuários desta clínica.';
  end if;
  select * into target from public.clinic_members
  where id = member_id and clinic_id = selected_clinic_id for update;
  if not found or target.role = 'platform_admin' then
    raise exception using errcode = '42501', message = 'Vínculo não encontrado nesta clínica.';
  end if;
  delete from public.clinic_members where id = member_id;
  update public.profiles set active_clinic_id = null
  where id = target.user_id and active_clinic_id = selected_clinic_id;
  insert into public.clinic_audit_logs (clinic_id, actor_id, target_user_id, event_type)
  values (selected_clinic_id, auth.uid(), target.user_id, 'member_removed');
end;
$$;

create or replace function public.renew_active_clinic_invite(invite_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  invite_email text;
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para reenviar convites desta clínica.';
  end if;
  update public.clinic_invites
  set status = 'pending', token = gen_random_uuid(), expires_at = now() + interval '7 days'
  where id = invite_id and clinic_id = selected_clinic_id and status in ('pending', 'expired')
  returning email into invite_email;
  if invite_email is null then
    raise exception using errcode = '42501', message = 'Convite não encontrado nesta clínica.';
  end if;
  return invite_email;
end;
$$;

create or replace function public.revoke_active_clinic_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para cancelar convites desta clínica.';
  end if;
  update public.clinic_invites set status = 'revoked'
  where id = invite_id and clinic_id = selected_clinic_id and status in ('pending', 'expired');
  if not found then
    raise exception using errcode = '42501', message = 'Convite não encontrado nesta clínica.';
  end if;
end;
$$;

-- Row level security
alter table public.profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.clinic_audit_logs enable row level security;
alter table public.clinic_invites enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;

-- Policies
drop policy if exists "Users read their own profile" on public.profiles;
drop policy if exists "Clinic members read active clinic profiles" on public.profiles;
drop policy if exists "Users update their own profile safely" on public.profiles;
create policy "Users read their own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "Clinic members read active clinic profiles" on public.profiles
  for select to authenticated using (public.can_read_active_clinic_profile(id));
create policy "Users update their own profile safely" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and public.can_update_own_profile(role, active_clinic_id));

drop policy if exists "Read member clinics" on public.clinics;
drop policy if exists "Manage active clinic" on public.clinics;
create policy "Read member clinics" on public.clinics
  for select to authenticated using (
    public.is_platform_admin() or exists (
      select 1 from public.clinic_members cm
      where cm.clinic_id = clinics.id and cm.user_id = auth.uid() and cm.status = 'active'
    )
  );
create policy "Manage active clinic" on public.clinics
  for update to authenticated
  using (id = public.active_clinic_id() and public.is_active_clinic_admin())
  with check (id = public.active_clinic_id() and public.is_active_clinic_admin());

drop policy if exists "Members read own membership" on public.clinic_members;
drop policy if exists "Clinic admins read active clinic members" on public.clinic_members;
create policy "Members read own membership" on public.clinic_members
  for select to authenticated using (user_id = auth.uid());
create policy "Clinic admins read active clinic members" on public.clinic_members
  for select to authenticated using (clinic_id = public.current_clinic_admin_id());

drop policy if exists "Read active clinic audit" on public.clinic_audit_logs;
create policy "Read active clinic audit" on public.clinic_audit_logs
  for select to authenticated using (
    (clinic_id = public.active_clinic_id() and public.is_active_clinic_admin()) or public.is_platform_admin()
  );

drop policy if exists "Clinic admins read active clinic invites" on public.clinic_invites;
drop policy if exists "Invitees read own pending invites" on public.clinic_invites;
create policy "Clinic admins read active clinic invites" on public.clinic_invites
  for select to authenticated using (clinic_id = public.current_clinic_admin_id());
create policy "Invitees read own pending invites" on public.clinic_invites
  for select to authenticated using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and status = 'pending' and expires_at > now()
  );

drop policy if exists "Clinic isolation for patients" on public.patients;
create policy "Clinic isolation for patients" on public.patients
  for all to authenticated
  using (public.is_active_clinic_member(clinic_id))
  with check (public.is_active_clinic_member(clinic_id));

drop policy if exists "Clinic isolation for appointments" on public.appointments;
create policy "Clinic isolation for appointments" on public.appointments
  for all to authenticated
  using (public.is_active_clinic_member(clinic_id))
  with check (public.is_active_clinic_member(clinic_id));

drop policy if exists "Users upload their patient photos" on storage.objects;
drop policy if exists "Users update their patient photos" on storage.objects;
drop policy if exists "Users delete their patient photos" on storage.objects;
drop policy if exists "Patient photos are publicly readable" on storage.objects;
create policy "Users upload their patient photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users update their patient photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete their patient photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Patient photos are publicly readable" on storage.objects
  for select to public using (bucket_id = 'patient-photos');

-- Grants
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.clinics to authenticated;
grant select on public.clinic_members, public.clinic_audit_logs, public.clinic_invites to authenticated;
grant select, insert, update, delete on public.patients, public.appointments to authenticated;
revoke insert, update, delete on public.clinic_members, public.clinic_invites from authenticated;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.active_clinic_id() from public;
revoke all on function public.is_active_clinic_member(uuid) from public;
revoke all on function public.is_active_clinic_admin() from public;
revoke all on function public.current_clinic_admin_id() from public;
revoke all on function public.can_read_active_clinic_profile(uuid) from public;
revoke all on function public.can_update_own_profile(public.user_role, uuid) from public;
revoke all on function public.set_active_clinic(uuid) from public;
revoke all on function public.create_clinic_with_owner(text, text, text, text, text) from public;
revoke all on function public.list_active_clinic_team() from public;
revoke all on function public.create_clinic_invite(text, text, text) from public;
revoke all on function public.accept_my_clinic_invites() from public;
revoke all on function public.update_active_clinic_member(uuid, text, text) from public;
revoke all on function public.remove_active_clinic_member(uuid) from public;
revoke all on function public.renew_active_clinic_invite(uuid) from public;
revoke all on function public.revoke_active_clinic_invite(uuid) from public;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.active_clinic_id() to authenticated;
grant execute on function public.is_active_clinic_member(uuid) to authenticated;
grant execute on function public.is_active_clinic_admin() to authenticated;
grant execute on function public.current_clinic_admin_id() to authenticated;
grant execute on function public.can_read_active_clinic_profile(uuid) to authenticated;
grant execute on function public.can_update_own_profile(public.user_role, uuid) to authenticated;
grant execute on function public.set_active_clinic(uuid) to authenticated;
grant execute on function public.create_clinic_with_owner(text, text, text, text, text) to authenticated;
grant execute on function public.list_active_clinic_team() to authenticated;
grant execute on function public.create_clinic_invite(text, text, text) to authenticated;
grant execute on function public.accept_my_clinic_invites() to authenticated;
grant execute on function public.update_active_clinic_member(uuid, text, text) to authenticated;
grant execute on function public.remove_active_clinic_member(uuid) to authenticated;
grant execute on function public.renew_active_clinic_invite(uuid) to authenticated;
grant execute on function public.revoke_active_clinic_invite(uuid) to authenticated;

-- Minimal seeds
insert into public.profiles (id, full_name, email, phone)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), email, phone
from auth.users
on conflict (id) do update set
  email = excluded.email,
  phone = excluded.phone;

insert into storage.buckets (id, name, public)
values ('patient-photos', 'patient-photos', true)
on conflict (id) do update set public = excluded.public;

commit;
