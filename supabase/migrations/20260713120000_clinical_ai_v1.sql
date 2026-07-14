begin;

create table if not exists public.ai_clinical_generations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  medical_record_id uuid references public.medical_records(id) on delete set null,
  professional_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('generated','accepted','discarded','failed')),
  input_hash text not null check (length(input_hash) = 64),
  model text not null,
  generated_sections text[] not null default '{}',
  accepted_sections text[] not null default '{}',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  discarded_at timestamptz
);
create index if not exists ai_clinical_generations_clinic_appointment_idx on public.ai_clinical_generations (clinic_id, appointment_id, created_at desc);
alter table public.ai_clinical_generations enable row level security;
drop policy if exists "Clinical AI generations select" on public.ai_clinical_generations;
drop policy if exists "Clinical AI generations insert" on public.ai_clinical_generations;
drop policy if exists "Clinical AI generations update" on public.ai_clinical_generations;
create policy "Clinical AI generations select" on public.ai_clinical_generations for select to authenticated using (public.can_access_medical_record_clinic(clinic_id));
create policy "Clinical AI generations insert" on public.ai_clinical_generations for insert to authenticated with check (public.can_access_medical_record_clinic(clinic_id) and professional_id = auth.uid());
create policy "Clinical AI generations update" on public.ai_clinical_generations for update to authenticated using (public.can_access_medical_record_clinic(clinic_id) and professional_id = auth.uid()) with check (public.can_access_medical_record_clinic(clinic_id) and professional_id = auth.uid());
grant select, insert, update on public.ai_clinical_generations to authenticated;

commit;
select pg_notify('pgrst', 'reload schema');
