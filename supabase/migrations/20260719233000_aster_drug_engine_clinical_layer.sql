begin;

create type public.medication_clinical_status as enum (
  'draft',
  'in_review',
  'reviewed',
  'approved',
  'suspended',
  'outdated'
);

create table public.medication_clinical_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text,
  organization text,
  version text,
  publication_year integer,
  reference_url text,
  accessed_at date,
  technical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medication_clinical_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null,
  version integer not null check (version > 0),
  presentation_id text,
  pharmaceutical_form_pattern text,
  status public.medication_clinical_status not null default 'draft',
  source_id uuid references public.medication_clinical_sources(id) on delete restrict,
  supersedes_id uuid references public.medication_clinical_profiles(id) on delete restrict,
  change_reason text,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  suspended_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (presentation_id is not null or pharmaceutical_form_pattern is not null),
  check (
    status not in ('reviewed', 'approved')
    or (source_id is not null and reviewed_by is not null and reviewed_at is not null)
  ),
  check (
    status <> 'approved'
    or (approved_by is not null and approved_at is not null)
  ),
  unique (profile_key, version)
);

create table public.medication_route_options (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.medication_clinical_profiles(id) on delete restrict,
  code text not null,
  label text not null,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (profile_id, code)
);

create table public.medication_dose_units (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.medication_clinical_profiles(id) on delete restrict,
  code text not null,
  singular_label text not null,
  plural_label text not null,
  allows_fraction boolean not null default false,
  measurable boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (profile_id, code)
);

create table public.medication_frequency_options (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  short_label text not null,
  prescription_text text not null,
  administrations_per_day numeric,
  interval_hours numeric,
  option_type text not null check (option_type in ('exact', 'conditional', 'continuous', 'custom')),
  status public.medication_clinical_status not null default 'approved',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.medication_duration_options (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  short_label text not null,
  prescription_text text not null,
  duration_days integer check (duration_days is null or duration_days > 0),
  option_type text not null check (option_type in ('exact', 'single_dose', 'continuous', 'conditional', 'custom')),
  status public.medication_clinical_status not null default 'approved',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.medication_guidance_templates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.medication_clinical_profiles(id) on delete restrict,
  code text not null,
  guidance_text text not null,
  status public.medication_clinical_status not null default 'draft',
  source_id uuid references public.medication_clinical_sources(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (profile_id, code, version)
);

create table public.medication_dosage_templates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.medication_clinical_profiles(id) on delete restrict,
  template_key text not null,
  name text not null,
  version integer not null check (version > 0),
  status public.medication_clinical_status not null default 'draft',
  source_id uuid not null references public.medication_clinical_sources(id) on delete restrict,
  route_code text,
  dose_amount numeric,
  dose_unit_code text,
  frequency_code text references public.medication_frequency_options(code) on delete restrict,
  duration_code text references public.medication_duration_options(code) on delete restrict,
  instructions text,
  population_context text,
  supersedes_id uuid references public.medication_dosage_templates(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (template_key, version),
  check (
    status not in ('reviewed', 'approved')
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  check (
    status <> 'approved'
    or (approved_by is not null and approved_at is not null)
  )
);

create table public.medication_clinical_audit_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index medication_clinical_profiles_presentation_idx
  on public.medication_clinical_profiles(presentation_id, status);
create index medication_clinical_profiles_form_idx
  on public.medication_clinical_profiles(pharmaceutical_form_pattern, status);
create index medication_dosage_templates_profile_idx
  on public.medication_dosage_templates(profile_id, status);
create index medication_clinical_audit_events_clinic_idx
  on public.medication_clinical_audit_events(clinic_id, created_at desc);

alter table public.medication_clinical_sources enable row level security;
alter table public.medication_clinical_profiles enable row level security;
alter table public.medication_route_options enable row level security;
alter table public.medication_dose_units enable row level security;
alter table public.medication_frequency_options enable row level security;
alter table public.medication_duration_options enable row level security;
alter table public.medication_guidance_templates enable row level security;
alter table public.medication_dosage_templates enable row level security;
alter table public.medication_clinical_audit_events enable row level security;

create policy "Authenticated users read clinical sources"
  on public.medication_clinical_sources for select to authenticated using (true);
create policy "Authenticated users read approved clinical profiles"
  on public.medication_clinical_profiles for select to authenticated
  using (status in ('reviewed', 'approved'));
create policy "Authenticated users read approved route options"
  on public.medication_route_options for select to authenticated
  using (exists (
    select 1 from public.medication_clinical_profiles profile
    where profile.id = profile_id and profile.status in ('reviewed', 'approved')
  ));
create policy "Authenticated users read approved dose units"
  on public.medication_dose_units for select to authenticated
  using (exists (
    select 1 from public.medication_clinical_profiles profile
    where profile.id = profile_id and profile.status in ('reviewed', 'approved')
  ));
create policy "Authenticated users read active frequency options"
  on public.medication_frequency_options for select to authenticated
  using (status in ('reviewed', 'approved'));
create policy "Authenticated users read active duration options"
  on public.medication_duration_options for select to authenticated
  using (status in ('reviewed', 'approved'));
create policy "Authenticated users read approved guidance templates"
  on public.medication_guidance_templates for select to authenticated
  using (status in ('reviewed', 'approved'));
create policy "Authenticated users read approved dosage templates"
  on public.medication_dosage_templates for select to authenticated
  using (status in ('reviewed', 'approved'));

grant select on public.medication_clinical_sources,
  public.medication_clinical_profiles,
  public.medication_route_options,
  public.medication_dose_units,
  public.medication_frequency_options,
  public.medication_duration_options,
  public.medication_guidance_templates,
  public.medication_dosage_templates
to authenticated;

insert into public.medication_frequency_options
  (code, short_label, prescription_text, administrations_per_day, interval_hours, option_type, sort_order)
values
  ('SINGLE_DOSE', 'Dose única', 'Dose única', 1, null, 'exact', 10),
  ('ONCE_DAILY', '1 vez ao dia', 'Uma vez ao dia', 1, 24, 'exact', 20),
  ('TWICE_DAILY', '2 vezes ao dia', 'Duas vezes ao dia', 2, 12, 'exact', 30),
  ('THREE_TIMES_DAILY', '3 vezes ao dia', 'Três vezes ao dia', 3, 8, 'exact', 40),
  ('FOUR_TIMES_DAILY', '4 vezes ao dia', 'Quatro vezes ao dia', 4, 6, 'exact', 50),
  ('EVERY_4_HOURS', '4/4 horas', 'A cada 4 horas', 6, 4, 'exact', 60),
  ('EVERY_6_HOURS', '6/6 horas', 'A cada 6 horas', 4, 6, 'exact', 70),
  ('EVERY_8_HOURS', '8/8 horas', 'A cada 8 horas', 3, 8, 'exact', 80),
  ('EVERY_12_HOURS', '12/12 horas', 'A cada 12 horas', 2, 12, 'exact', 90),
  ('EVERY_24_HOURS', '24/24 horas', 'A cada 24 horas', 1, 24, 'exact', 100),
  ('MORNING', 'Pela manhã', 'Pela manhã', 1, null, 'exact', 110),
  ('NIGHT', 'À noite', 'À noite', 1, null, 'exact', 120),
  ('AS_NEEDED', 'Se necessário', 'Se necessário', null, null, 'conditional', 130),
  ('CONTINUOUS', 'Uso contínuo', 'Uso contínuo', null, null, 'continuous', 140),
  ('CUSTOM', 'Personalizar', 'Conforme prescrição personalizada', null, null, 'custom', 999);

insert into public.medication_duration_options
  (code, short_label, prescription_text, duration_days, option_type, sort_order)
values
  ('SINGLE_DOSE', 'Dose única', 'Dose única', 1, 'single_dose', 10),
  ('DAYS_1', '1 dia', 'Por 1 dia', 1, 'exact', 20),
  ('DAYS_3', '3 dias', 'Por 3 dias', 3, 'exact', 30),
  ('DAYS_5', '5 dias', 'Por 5 dias', 5, 'exact', 40),
  ('DAYS_7', '7 dias', 'Por 7 dias', 7, 'exact', 50),
  ('DAYS_10', '10 dias', 'Por 10 dias', 10, 'exact', 60),
  ('DAYS_14', '14 dias', 'Por 14 dias', 14, 'exact', 70),
  ('DAYS_21', '21 dias', 'Por 21 dias', 21, 'exact', 80),
  ('DAYS_30', '30 dias', 'Por 30 dias', 30, 'exact', 90),
  ('CONTINUOUS', 'Uso contínuo', 'Uso contínuo', null, 'continuous', 100),
  ('UNTIL_REASSESSMENT', 'Até reavaliação', 'Até reavaliação', null, 'conditional', 110),
  ('AS_NEEDED', 'Enquanto necessário', 'Enquanto necessário', null, 'conditional', 120),
  ('CUSTOM', 'Personalizar', 'Duração personalizada', null, 'custom', 999);

commit;
select pg_notify('pgrst', 'reload schema');
