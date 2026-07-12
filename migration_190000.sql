begin;

alter table public.profiles add column if not exists active_clinic_id uuid;

create or replace function public.active_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.active_clinic_id
  from public.profiles profile
  join public.clinic_members member
    on member.clinic_id = profile.active_clinic_id
   and member.user_id = auth.uid()
   and member.status = 'active'
  where profile.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_active_clinic_member(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_clinic_id is not null
    and target_clinic_id = public.active_clinic_id()
    and exists (
      select 1 from public.clinic_members member
      where member.clinic_id = target_clinic_id
        and member.user_id = auth.uid()
        and member.status = 'active'
    );
$$;

create or replace function public.is_active_clinic_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinic_members member
    where member.clinic_id = public.active_clinic_id()
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role in ('clinic_admin', 'platform_admin')
  );
$$;

revoke all on function public.active_clinic_id() from public;
revoke all on function public.is_active_clinic_member(uuid) from public;
revoke all on function public.is_active_clinic_admin() from public;
grant execute on function public.active_clinic_id() to authenticated;
grant execute on function public.is_active_clinic_member(uuid) to authenticated;
grant execute on function public.is_active_clinic_admin() to authenticated;

alter table public.clinics add column if not exists cnes text;
alter table public.clinics add column if not exists whatsapp text;
alter table public.clinics add column if not exists zip_code text;
alter table public.clinics add column if not exists address_number text;
alter table public.clinics add column if not exists address_complement text;
alter table public.clinics add column if not exists neighborhood text;
alter table public.clinics add column if not exists city text;
alter table public.clinics add column if not exists state text;

create table if not exists public.professional_profiles (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  professional_name text,
  profession text,
  council text,
  council_number text,
  council_state text,
  specialty text,
  rqe text,
  phone text,
  email text,
  signature_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(clinic_id, user_id)
);
create index if not exists professional_profiles_clinic_idx on public.professional_profiles(clinic_id, is_active);

create or replace function public.enforce_professional_profile_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_role public.clinic_member_role;
begin
  select role into target_role from public.clinic_members where clinic_id = new.clinic_id and user_id = new.user_id and status = 'active';
  if target_role is null or target_role not in ('doctor','clinic_admin') then raise exception using errcode='42501', message='O profissional precisa ter vínculo ativo com a clínica.'; end if;
  new.updated_at := now(); return new;
end $$;
drop trigger if exists professional_profiles_enforce_tenant on public.professional_profiles;
create trigger professional_profiles_enforce_tenant before insert or update on public.professional_profiles for each row execute function public.enforce_professional_profile_tenant();

alter table public.professional_profiles enable row level security;
drop policy if exists "Clinic members view professional profiles" on public.professional_profiles;
drop policy if exists "Clinic admins manage professional profiles" on public.professional_profiles;
drop policy if exists "Professionals update own professional profile" on public.professional_profiles;
create policy "Clinic members view professional profiles" on public.professional_profiles for select to authenticated using (public.is_active_clinic_member(clinic_id));
create policy "Clinic admins manage professional profiles" on public.professional_profiles for all to authenticated using (clinic_id=public.active_clinic_id() and public.is_active_clinic_admin()) with check (clinic_id=public.active_clinic_id() and public.is_active_clinic_admin());
create policy "Professionals update own professional profile" on public.professional_profiles for update to authenticated using (clinic_id=public.active_clinic_id() and user_id=auth.uid()) with check (clinic_id=public.active_clinic_id() and user_id=auth.uid());
grant select, insert, update on public.professional_profiles to authenticated;

commit;
select pg_notify('pgrst','reload schema');
