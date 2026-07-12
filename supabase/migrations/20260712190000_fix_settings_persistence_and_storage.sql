begin;

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
  updated_at timestamptz not null default now()
);
alter table public.clinics add column if not exists cnes text;
alter table public.clinics add column if not exists whatsapp text;
alter table public.clinics add column if not exists logo_url text;
alter table public.clinics add column if not exists website text;
alter table public.clinics add column if not exists instagram text;
alter table public.clinics add column if not exists favicon_url text;
alter table public.clinics add column if not exists zip_code text;
alter table public.clinics add column if not exists address text;
alter table public.clinics add column if not exists address_number text;
alter table public.clinics add column if not exists address_complement text;
alter table public.clinics add column if not exists neighborhood text;
alter table public.clinics add column if not exists city text;
alter table public.clinics add column if not exists state text;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  active_clinic_id uuid references public.clinics(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists active_clinic_id uuid references public.clinics(id) on delete set null;

create table if not exists public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.clinic_member_role not null default 'receptionist',
  status public.clinic_member_status not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);
create index if not exists clinic_members_user_status_idx on public.clinic_members(user_id, status);
create index if not exists clinic_members_clinic_status_idx on public.clinic_members(clinic_id, status);

do $$ begin
  alter table public.profiles add constraint profiles_active_clinic_settings_fk foreign key (active_clinic_id) references public.clinics(id) on delete set null not valid;
exception when duplicate_object then null; end $$;

create or replace function public.active_clinic_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select p.active_clinic_id
  from public.profiles p
  join public.clinic_members m on m.clinic_id = p.active_clinic_id and m.user_id = auth.uid() and m.status = 'active'
  where p.id = auth.uid()
  limit 1
$$;
create or replace function public.is_active_clinic_member(target_clinic_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select target_clinic_id is not null and target_clinic_id = public.active_clinic_id() $$;
create or replace function public.is_active_clinic_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.clinic_members m
    where m.clinic_id = public.active_clinic_id() and m.user_id = auth.uid() and m.status = 'active'
      and m.role in ('clinic_admin', 'platform_admin')
  )
$$;
revoke all on function public.active_clinic_id(), public.is_active_clinic_member(uuid), public.is_active_clinic_admin() from public;
grant execute on function public.active_clinic_id(), public.is_active_clinic_member(uuid), public.is_active_clinic_admin() to authenticated;

create table if not exists public.professional_profiles (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  professional_name text, profession text, council text, council_number text, council_state text,
  specialty text, sub_specialty text, rqe text, phone text, email text, photo_url text,
  signature_url text, stamp_url text, is_active boolean not null default true,
  is_responsible boolean not null default false, updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);
alter table public.professional_profiles add column if not exists sub_specialty text;
alter table public.professional_profiles add column if not exists photo_url text;
alter table public.professional_profiles add column if not exists stamp_url text;
alter table public.professional_profiles add column if not exists is_responsible boolean not null default false;
alter table public.professional_profiles add column if not exists updated_by uuid references auth.users(id);
create unique index if not exists professional_profiles_clinic_user_uidx on public.professional_profiles(clinic_id, user_id);
create index if not exists professional_profiles_clinic_active_idx on public.professional_profiles(clinic_id, is_active);

create table if not exists public.clinic_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  default_appointment_duration integer not null default 30, appointment_interval integer not null default 0,
  business_start time, business_end time, lunch_start time, lunch_end time,
  service_days jsonb not null default '[1,2,3,4,5]'::jsonb, allow_waitlist boolean not null default true,
  minimum_booking_notice integer not null default 0, maximum_booking_horizon integer not null default 90,
  holidays jsonb not null default '[]'::jsonb, blocked_periods jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
create table if not exists public.document_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  header_text text, footer_text text, default_city text, signature_text text,
  show_logo boolean not null default true, show_cnpj boolean not null default true,
  show_address boolean not null default true, show_phone boolean not null default true,
  show_email boolean not null default true, show_council boolean not null default true,
  show_specialty boolean not null default true, show_rqe boolean not null default true,
  physical_signature_space boolean not null default true, automatic_numbering boolean not null default true,
  document_prefix text, updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
create table if not exists public.schedule_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  default_duration integer not null default 30, interval_between integer not null default 0,
  start_time time, end_time time, lunch_start time, lunch_end time,
  service_days jsonb not null default '[1,2,3,4,5]'::jsonb, allow_fit_in boolean not null default true,
  minimum_notice integer not null default 0, maximum_advance integer not null default 90,
  holidays jsonb not null default '[]'::jsonb, blocked_periods jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
create table if not exists public.ai_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  enabled boolean not null default false, language text not null default 'pt-BR', default_specialty text,
  detail_level text not null default 'standard', evolution_format text not null default 'free',
  suggest_cid boolean not null default true, suggest_differentials boolean not null default false,
  suggest_exams boolean not null default false, suggest_conduct boolean not null default false,
  require_human_review boolean not null default true, consent_text text,
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);

create or replace function public.settings_set_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
do $$ declare target text; begin
  foreach target in array array['clinic_settings','document_settings','schedule_settings','ai_settings'] loop
    execute format('drop trigger if exists settings_set_updated_at on public.%I', target);
    execute format('create trigger settings_set_updated_at before update on public.%I for each row execute function public.settings_set_updated_at()', target);
  end loop;
end $$;
create or replace function public.settings_touch_entity()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;
do $$ declare target text; begin
  foreach target in array array['clinics','profiles','clinic_members','professional_profiles'] loop
    execute format('drop trigger if exists settings_touch_entity on public.%I', target);
    execute format('create trigger settings_touch_entity before update on public.%I for each row execute function public.settings_touch_entity()', target);
  end loop;
end $$;

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.clinic_members enable row level security;
alter table public.professional_profiles enable row level security;
alter table public.clinic_settings enable row level security;
alter table public.document_settings enable row level security;
alter table public.schedule_settings enable row level security;
alter table public.ai_settings enable row level security;

drop policy if exists "Settings members read clinics" on public.clinics;
drop policy if exists "Settings admins update clinics" on public.clinics;
create policy "Settings members read clinics" on public.clinics for select to authenticated
using (id = public.active_clinic_id());
create policy "Settings admins update clinics" on public.clinics for update to authenticated
using (id = public.active_clinic_id() and public.is_active_clinic_admin())
with check (id = public.active_clinic_id() and public.is_active_clinic_admin());
drop policy if exists "Settings users read own profile" on public.profiles;
drop policy if exists "Settings users update own profile" on public.profiles;
create policy "Settings users read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Settings users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "Settings members read active memberships" on public.clinic_members;
create policy "Settings members read active memberships" on public.clinic_members for select to authenticated
using (clinic_id = public.active_clinic_id());
drop policy if exists "Settings members read professionals" on public.professional_profiles;
drop policy if exists "Settings admins manage professionals" on public.professional_profiles;
drop policy if exists "Settings professionals insert own profile" on public.professional_profiles;
drop policy if exists "Settings professionals update own profile" on public.professional_profiles;
create policy "Settings members read professionals" on public.professional_profiles for select to authenticated
using (public.is_active_clinic_member(clinic_id));
create policy "Settings admins manage professionals" on public.professional_profiles for all to authenticated
using (clinic_id = public.active_clinic_id() and public.is_active_clinic_admin())
with check (clinic_id = public.active_clinic_id() and public.is_active_clinic_admin());
create policy "Settings professionals insert own profile" on public.professional_profiles for insert to authenticated
with check (clinic_id = public.active_clinic_id() and user_id = auth.uid());
create policy "Settings professionals update own profile" on public.professional_profiles for update to authenticated
using (clinic_id = public.active_clinic_id() and user_id = auth.uid())
with check (clinic_id = public.active_clinic_id() and user_id = auth.uid());

do $$ declare target text; begin
  foreach target in array array['clinic_settings','document_settings','schedule_settings','ai_settings'] loop
    execute format('drop policy if exists "Settings active members read" on public.%I', target);
    execute format('drop policy if exists "Settings active admins write" on public.%I', target);
    execute format('create policy "Settings active members read" on public.%I for select to authenticated using (public.is_active_clinic_member(clinic_id))', target);
    execute format('create policy "Settings active admins write" on public.%I for all to authenticated using (clinic_id = public.active_clinic_id() and public.is_active_clinic_admin()) with check (clinic_id = public.active_clinic_id() and public.is_active_clinic_admin())', target);
  end loop;
end $$;
grant select, update on public.clinics to authenticated;
grant select, insert, update on public.professional_profiles to authenticated;
grant select, insert, update on public.clinic_settings, public.document_settings, public.schedule_settings, public.ai_settings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-assets', 'clinic-assets', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.clinic_asset_clinic_id(object_name text)
returns uuid language plpgsql stable security invoker set search_path = public
as $$
begin
  if object_name !~ '^clinics/[0-9a-fA-F-]{36}/logo/[^/]+$' then return null; end if;
  return (storage.foldername(object_name))[2]::uuid;
exception when invalid_text_representation then return null;
end $$;
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
