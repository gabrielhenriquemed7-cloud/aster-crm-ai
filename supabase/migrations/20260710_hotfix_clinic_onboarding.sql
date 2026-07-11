begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role'
  ) then
    create type public.user_role as enum ('administrator', 'doctor', 'secretary', 'receptionist');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'clinic_status'
  ) then
    create type public.clinic_status as enum ('active', 'inactive', 'suspended');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'clinic_plan'
  ) then
    create type public.clinic_plan as enum ('starter', 'professional', 'enterprise');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'clinic_member_role'
  ) then
    create type public.clinic_member_role as enum ('platform_admin', 'clinic_admin', 'doctor', 'secretary', 'receptionist');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'clinic_member_status'
  ) then
    create type public.clinic_member_status as enum ('active', 'inactive', 'invited');
  end if;
end
$$;

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

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists role public.user_role default 'receptionist';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists active_clinic_id uuid;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

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

alter table public.clinics add column if not exists name text;
alter table public.clinics add column if not exists legal_name text;
alter table public.clinics add column if not exists cnpj text;
alter table public.clinics add column if not exists email text;
alter table public.clinics add column if not exists phone text;
alter table public.clinics add column if not exists status public.clinic_status default 'active';
alter table public.clinics add column if not exists plan public.clinic_plan default 'starter';
alter table public.clinics add column if not exists created_at timestamptz default now();
alter table public.clinics add column if not exists updated_at timestamptz default now();

create table if not exists public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  user_id uuid not null,
  role public.clinic_member_role not null default 'receptionist',
  status public.clinic_member_status not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clinic_members add column if not exists clinic_id uuid;
alter table public.clinic_members add column if not exists user_id uuid;
alter table public.clinic_members add column if not exists role public.clinic_member_role default 'receptionist';
alter table public.clinic_members add column if not exists status public.clinic_member_status default 'active';
alter table public.clinic_members add column if not exists created_by uuid;
alter table public.clinic_members add column if not exists created_at timestamptz default now();
alter table public.clinic_members add column if not exists updated_at timestamptz default now();

create index if not exists profiles_active_clinic_idx
  on public.profiles(active_clinic_id);

create index if not exists clinics_name_idx
  on public.clinics(name);

create index if not exists clinic_members_user_idx
  on public.clinic_members(user_id, status);

create index if not exists clinic_members_clinic_idx
  on public.clinic_members(clinic_id, status);

create unique index if not exists clinic_members_clinic_user_unique_idx
  on public.clinic_members(clinic_id, user_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and conname = 'profiles_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and conname = 'profiles_active_clinic_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_active_clinic_id_fkey
      foreign key (active_clinic_id) references public.clinics(id) on delete set null
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.clinic_members'::regclass
      and contype = 'f'
      and conname = 'clinic_members_clinic_id_fkey'
  ) then
    alter table public.clinic_members
      add constraint clinic_members_clinic_id_fkey
      foreign key (clinic_id) references public.clinics(id) on delete cascade
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.clinic_members'::regclass
      and contype = 'f'
      and conname = 'clinic_members_user_id_fkey'
  ) then
    alter table public.clinic_members
      add constraint clinic_members_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.clinic_members'::regclass
      and contype = 'f'
      and conname = 'clinic_members_created_by_fkey'
  ) then
    alter table public.clinic_members
      add constraint clinic_members_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null
      not valid;
  end if;
end
$$;

alter table public.profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Hotfix users read own profile'
  ) then
    create policy "Hotfix users read own profile"
      on public.profiles
      for select
      to authenticated
      using (id = auth.uid());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'clinics'
      and policyname = 'Hotfix members read clinics'
  ) then
    create policy "Hotfix members read clinics"
      on public.clinics
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.clinic_members cm
          where cm.clinic_id = clinics.id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'clinic_members'
      and policyname = 'Hotfix users read own memberships'
  ) then
    create policy "Hotfix users read own memberships"
      on public.clinic_members
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end
$$;

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.clinics') is null
     or to_regclass('public.clinic_members') is null then
    raise exception 'O hotfix não conseguiu criar todas as tabelas necessárias ao onboarding.';
  end if;
end
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
    raise exception using
      errcode = '28000',
      message = 'Você precisa estar autenticado para criar uma clínica.';
  end if;

  if coalesce(trim(clinic_name), '') = ''
     or char_length(trim(clinic_name)) < 3 then
    raise exception using
      errcode = '22023',
      message = 'Informe um nome de clínica com pelo menos 3 caracteres.';
  end if;

  if exists (
    select 1
    from public.clinic_members
    where user_id = current_user_id
      and status = 'active'
      and role <> 'platform_admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Usuários já vinculados a uma clínica não podem criar outra clínica.';
  end if;

  insert into public.profiles (
    id,
    full_name,
    email
  )
  select
    id,
    coalesce(raw_user_meta_data ->> 'full_name', ''),
    email
  from auth.users
  where id = current_user_id
  on conflict (id) do update
    set email = coalesce(public.profiles.email, excluded.email);

  insert into public.clinics (
    name,
    legal_name,
    cnpj,
    email,
    phone,
    status,
    plan
  )
  values (
    trim(clinic_name),
    nullif(trim(coalesce(clinic_legal_name, '')), ''),
    nullif(regexp_replace(coalesce(clinic_cnpj, ''), '\D', '', 'g'), ''),
    nullif(lower(trim(coalesce(clinic_email, ''))), ''),
    nullif(trim(coalesce(clinic_phone, '')), ''),
    'active',
    'starter'
  )
  returning id into new_clinic_id;

  insert into public.clinic_members (
    clinic_id,
    user_id,
    role,
    status,
    created_by
  )
  values (
    new_clinic_id,
    current_user_id,
    'clinic_admin',
    'active',
    current_user_id
  );

  update public.profiles
  set
    active_clinic_id = new_clinic_id,
    role = 'administrator'
  where id = current_user_id;

  return new_clinic_id;
end;
$$;

create or replace function public.set_active_clinic(target_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Você precisa estar autenticado.';
  end if;

  if not exists (
    select 1
    from public.clinic_members
    where user_id = auth.uid()
      and clinic_id = target_clinic_id
      and status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Sem vínculo ativo com esta clínica.';
  end if;

  update public.profiles
  set active_clinic_id = target_clinic_id
  where id = auth.uid();
end;
$$;

revoke all
  on function public.create_clinic_with_owner(text, text, text, text, text)
  from public;

grant execute
  on function public.create_clinic_with_owner(text, text, text, text, text)
  to authenticated;

revoke all
  on function public.set_active_clinic(uuid)
  from public;

grant execute
  on function public.set_active_clinic(uuid)
  to authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.clinics to authenticated;
grant select on public.clinic_members to authenticated;

commit;
