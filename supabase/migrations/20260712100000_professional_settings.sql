begin;

alter table public.clinics add column if not exists website text;
alter table public.clinics add column if not exists instagram text;
alter table public.clinics add column if not exists favicon_url text;

alter table public.professional_profiles add column if not exists sub_specialty text;
alter table public.professional_profiles add column if not exists photo_url text;
alter table public.professional_profiles add column if not exists stamp_url text;
alter table public.professional_profiles add column if not exists is_responsible boolean not null default false;
alter table public.professional_profiles add column if not exists updated_by uuid references auth.users(id);

do $$ begin
  alter type public.clinic_member_role add value if not exists 'nurse';
  alter type public.clinic_member_role add value if not exists 'billing';
  alter type public.clinic_member_role add value if not exists 'viewer';
exception when undefined_object then null;
end $$;

create table if not exists public.clinic_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  default_appointment_duration integer not null default 30,
  appointment_interval integer not null default 0,
  business_start time,
  business_end time,
  lunch_start time,
  lunch_end time,
  service_days jsonb not null default '[1,2,3,4,5]'::jsonb,
  allow_waitlist boolean not null default true,
  minimum_booking_notice integer not null default 0,
  maximum_booking_horizon integer not null default 90,
  holidays jsonb not null default '[]'::jsonb,
  blocked_periods jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.document_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  header_text text,
  footer_text text,
  default_city text,
  signature_text text,
  show_logo boolean not null default true,
  show_cnpj boolean not null default true,
  show_address boolean not null default true,
  show_phone boolean not null default true,
  show_email boolean not null default true,
  show_council boolean not null default true,
  show_specialty boolean not null default true,
  show_rqe boolean not null default true,
  physical_signature_space boolean not null default true,
  automatic_numbering boolean not null default true,
  document_prefix text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.schedule_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  default_duration integer not null default 30,
  interval_between integer not null default 0,
  start_time time,
  end_time time,
  lunch_start time,
  lunch_end time,
  service_days jsonb not null default '[1,2,3,4,5]'::jsonb,
  allow_fit_in boolean not null default true,
  minimum_notice integer not null default 0,
  maximum_advance integer not null default 90,
  holidays jsonb not null default '[]'::jsonb,
  blocked_periods jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.ai_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  enabled boolean not null default false,
  language text not null default 'pt-BR',
  default_specialty text,
  detail_level text not null default 'standard',
  evolution_format text not null default 'free',
  suggest_cid boolean not null default true,
  suggest_differentials boolean not null default false,
  suggest_exams boolean not null default false,
  suggest_conduct boolean not null default false,
  require_human_review boolean not null default true,
  consent_text text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create or replace function public.touch_settings_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end;
$$;

do $$ declare table_name text; begin
  foreach table_name in array array['clinic_settings','document_settings','schedule_settings','ai_settings'] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_settings_updated_at()', table_name, table_name);
  end loop;
end $$;

alter table public.clinic_settings enable row level security;
alter table public.document_settings enable row level security;
alter table public.schedule_settings enable row level security;
alter table public.ai_settings enable row level security;

do $$ declare table_name text; begin
  foreach table_name in array array['clinic_settings','document_settings','schedule_settings','ai_settings'] loop
    execute format('drop policy if exists %I on public.%I', 'Members read ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'Admins write ' || table_name, table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_active_clinic_member(clinic_id))', 'Members read ' || table_name, table_name);
    execute format('create policy %I on public.%I for all to authenticated using (clinic_id = public.active_clinic_id() and public.is_active_clinic_admin()) with check (clinic_id = public.active_clinic_id() and public.is_active_clinic_admin())', 'Admins write ' || table_name, table_name);
  end loop;
end $$;

grant select, insert, update on public.clinic_settings, public.document_settings, public.schedule_settings, public.ai_settings to authenticated;

insert into storage.buckets (id, name, public)
values ('clinic-assets', 'clinic-assets', true)
on conflict (id) do nothing;

drop policy if exists "Clinic members read clinic assets" on storage.objects;
drop policy if exists "Clinic admins upload clinic assets" on storage.objects;
drop policy if exists "Clinic admins update clinic assets" on storage.objects;
drop policy if exists "Clinic admins delete clinic assets" on storage.objects;
create policy "Clinic members read clinic assets" on storage.objects for select to authenticated
using (bucket_id = 'clinic-assets' and public.is_active_clinic_member((storage.foldername(name))[1]::uuid));
create policy "Clinic admins upload clinic assets" on storage.objects for insert to authenticated
with check (bucket_id = 'clinic-assets' and public.is_active_clinic_admin() and (storage.foldername(name))[1]::uuid = public.active_clinic_id());
create policy "Clinic admins update clinic assets" on storage.objects for update to authenticated
using (bucket_id = 'clinic-assets' and public.is_active_clinic_admin() and (storage.foldername(name))[1]::uuid = public.active_clinic_id())
with check (bucket_id = 'clinic-assets' and public.is_active_clinic_admin() and (storage.foldername(name))[1]::uuid = public.active_clinic_id());
create policy "Clinic admins delete clinic assets" on storage.objects for delete to authenticated
using (bucket_id = 'clinic-assets' and public.is_active_clinic_admin() and (storage.foldername(name))[1]::uuid = public.active_clinic_id());

commit;
select pg_notify('pgrst', 'reload schema');
