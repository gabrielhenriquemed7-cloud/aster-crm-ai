begin;

create table if not exists public.longitudinal_clinical_summaries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  generated_by uuid not null references auth.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  last_record_at timestamptz,
  records_count integer not null default 0 check (records_count >= 0),
  model text not null,
  schema_version text not null,
  summary jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  status text not null check (status in ('ready', 'partial', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, patient_id)
);

create index if not exists longitudinal_summaries_clinic_patient_idx
  on public.longitudinal_clinical_summaries (clinic_id, patient_id);

alter table public.longitudinal_clinical_summaries enable row level security;

drop policy if exists "Longitudinal summaries select"
  on public.longitudinal_clinical_summaries;
drop policy if exists "Longitudinal summaries insert"
  on public.longitudinal_clinical_summaries;
drop policy if exists "Longitudinal summaries update"
  on public.longitudinal_clinical_summaries;

create policy "Longitudinal summaries select"
  on public.longitudinal_clinical_summaries
  for select to authenticated
  using (public.can_access_medical_record_clinic(clinic_id));

create policy "Longitudinal summaries insert"
  on public.longitudinal_clinical_summaries
  for insert to authenticated
  with check (
    public.can_access_medical_record_clinic(clinic_id)
    and generated_by = auth.uid()
    and exists (
      select 1 from public.patients patient
      where patient.id = patient_id and patient.clinic_id = clinic_id
    )
  );

create policy "Longitudinal summaries update"
  on public.longitudinal_clinical_summaries
  for update to authenticated
  using (public.can_access_medical_record_clinic(clinic_id))
  with check (
    public.can_access_medical_record_clinic(clinic_id)
    and generated_by = auth.uid()
  );

grant select, insert, update on public.longitudinal_clinical_summaries
  to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
