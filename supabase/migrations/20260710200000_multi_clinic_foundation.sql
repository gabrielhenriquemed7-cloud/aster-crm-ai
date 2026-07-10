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
  id uuid primary key default gen_random_uuid(), name text not null, legal_name text,
  cnpj text, email text, phone text, status public.clinic_status not null default 'active',
  plan public.clinic_plan not null default 'starter', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists active_clinic_id uuid;

create table if not exists public.clinic_members (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.clinic_member_role not null default 'receptionist', status public.clinic_member_status not null default 'active',
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);
create index if not exists clinic_members_user_idx on public.clinic_members(user_id, status);
create index if not exists clinic_members_clinic_idx on public.clinic_members(clinic_id, status);

alter table public.profiles drop constraint if exists profiles_active_clinic_id_fkey;
alter table public.profiles add constraint profiles_active_clinic_id_fkey foreign key (active_clinic_id) references public.clinics(id) on delete set null;

create table if not exists public.clinic_audit_logs (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade,
  actor_id uuid references auth.users(id), target_user_id uuid references auth.users(id), event_type text not null,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

-- Preserve existing users and records by provisioning one initial clinic per existing user without a membership.
insert into public.profiles (id, full_name, email)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), email from auth.users
on conflict (id) do update set email = coalesce(public.profiles.email, excluded.email);

insert into public.clinics (name, legal_name)
select coalesce(nullif(p.full_name, ''), 'Minha clínica'), nullif(p.full_name, '')
from public.profiles p where not exists (select 1 from public.clinic_members cm where cm.user_id = p.id);

-- Each generated clinic is paired deterministically with the still-unlinked profile by creation order.
with unlinked as (select p.id, row_number() over (order by p.created_at, p.id) rn from public.profiles p where not exists (select 1 from public.clinic_members cm where cm.user_id = p.id)), new_clinics as (select c.id, row_number() over (order by c.created_at, c.id) rn from public.clinics c where not exists (select 1 from public.clinic_members cm where cm.clinic_id = c.id))
insert into public.clinic_members (clinic_id, user_id, role, status, created_by)
select c.id, u.id, 'clinic_admin', 'active', u.id from unlinked u join new_clinics c using (rn)
on conflict (clinic_id, user_id) do nothing;

update public.profiles p set active_clinic_id = cm.clinic_id
from lateral (select clinic_id from public.clinic_members where user_id = p.id and status = 'active' order by created_at limit 1) cm
where p.active_clinic_id is null;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clinic_members where user_id = auth.uid() and role = 'platform_admin' and status = 'active');
$$;
create or replace function public.active_clinic_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.active_clinic_id from public.profiles p join public.clinic_members cm on cm.clinic_id = p.active_clinic_id and cm.user_id = p.id and cm.status = 'active' where p.id = auth.uid();
$$;
create or replace function public.is_active_clinic_member(target_clinic_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (select 1 from public.clinic_members cm where cm.user_id = auth.uid() and cm.clinic_id = target_clinic_id and cm.status = 'active' and target_clinic_id = public.active_clinic_id());
$$;
create or replace function public.is_active_clinic_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (select 1 from public.clinic_members cm where cm.user_id = auth.uid() and cm.clinic_id = public.active_clinic_id() and cm.status = 'active' and cm.role = 'clinic_admin');
$$;

create or replace function public.set_active_clinic(target_clinic_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.clinic_members where user_id = auth.uid() and clinic_id = target_clinic_id and status = 'active') and not public.is_platform_admin() then raise exception 'Sem vínculo ativo com esta clínica'; end if;
  update public.profiles set active_clinic_id = target_clinic_id where id = auth.uid();
end; $$;

create or replace function public.create_clinic_for_current_user(clinic_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_clinic_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  insert into public.clinics(name, legal_name) values (trim(clinic_name), trim(clinic_name)) returning id into new_clinic_id;
  insert into public.clinic_members(clinic_id, user_id, role, status, created_by) values (new_clinic_id, auth.uid(), 'clinic_admin', 'active', auth.uid());
  update public.profiles set active_clinic_id = new_clinic_id where id = auth.uid();
  insert into public.clinic_audit_logs(clinic_id, actor_id, target_user_id, event_type) values (new_clinic_id, auth.uid(), auth.uid(), 'clinic_created');
  return new_clinic_id;
end; $$;

alter table public.patients add column if not exists clinic_id uuid references public.clinics(id) on delete restrict;
update public.patients p set clinic_id = pr.active_clinic_id from public.profiles pr where pr.id = p.user_id and p.clinic_id is null;
alter table public.patients alter column clinic_id set not null;
create index if not exists patients_clinic_idx on public.patients(clinic_id, full_name);

do $$ declare table_name text; begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'appointments') then
    alter table public.appointments add column if not exists clinic_id uuid references public.clinics(id) on delete restrict;
    update public.appointments a set clinic_id = p.active_clinic_id from public.profiles p where p.id = a.user_id and a.clinic_id is null;
    alter table public.appointments alter column clinic_id set not null;
    create index if not exists appointments_clinic_starts_idx on public.appointments(clinic_id, starts_at);
  end if;
  foreach table_name in array array['medical_records', 'prescriptions', 'financial_transactions'] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = table_name) then execute format('alter table public.%I add column if not exists clinic_id uuid references public.clinics(id) on delete restrict', table_name); end if;
  end loop;
end $$;

alter table public.clinics enable row level security; alter table public.clinic_members enable row level security; alter table public.clinic_audit_logs enable row level security;
drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile except active clinic" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and active_clinic_id is not distinct from (select active_clinic_id from public.profiles where id = auth.uid()));
drop policy if exists "Users manage their own patients" on public.patients;
create policy "Clinic isolation for patients" on public.patients for all to authenticated using (public.is_active_clinic_member(clinic_id)) with check (public.is_active_clinic_member(clinic_id));
drop policy if exists "Users manage their own appointments" on public.appointments;
create policy "Clinic isolation for appointments" on public.appointments for all to authenticated using (public.is_active_clinic_member(clinic_id)) with check (public.is_active_clinic_member(clinic_id));
create policy "Read member clinics" on public.clinics for select to authenticated using (public.is_platform_admin() or exists (select 1 from public.clinic_members cm where cm.clinic_id = clinics.id and cm.user_id = auth.uid() and cm.status = 'active'));
create policy "Create clinic" on public.clinics for insert to authenticated with check (auth.uid() is not null);
create policy "Manage active clinic" on public.clinics for update to authenticated using (id = public.active_clinic_id() and public.is_active_clinic_admin()) with check (id = public.active_clinic_id() and public.is_active_clinic_admin());
create policy "Read own or active clinic members" on public.clinic_members for select to authenticated using (user_id = auth.uid() or clinic_id = public.active_clinic_id() or public.is_platform_admin());
create policy "Clinic admins manage members" on public.clinic_members for all to authenticated using (clinic_id = public.active_clinic_id() and public.is_active_clinic_admin()) with check (clinic_id = public.active_clinic_id() and public.is_active_clinic_admin() and role <> 'platform_admin');
create policy "Read active clinic audit" on public.clinic_audit_logs for select to authenticated using (clinic_id = public.active_clinic_id() and public.is_active_clinic_admin() or public.is_platform_admin());

create trigger clinics_set_updated_at before update on public.clinics for each row execute procedure public.set_updated_at();
create trigger clinic_members_set_updated_at before update on public.clinic_members for each row execute procedure public.set_updated_at();
