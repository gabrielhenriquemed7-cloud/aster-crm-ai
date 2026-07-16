begin;
create table if not exists public.clinical_score_results (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict, appointment_id uuid not null references public.appointments(id) on delete restrict,
 professional_id uuid not null references auth.users(id) on delete restrict, score text not null, result numeric not null,
 data_used jsonb not null, calculated_at timestamptz not null default now(), score_version text not null
);
create index if not exists clinical_score_results_appointment_idx on public.clinical_score_results(clinic_id,appointment_id,calculated_at desc);
alter table public.clinical_score_results enable row level security;
create policy "Clinical scores select" on public.clinical_score_results for select to authenticated using (public.can_access_medical_record_clinic(clinic_id));
create policy "Clinical scores insert" on public.clinical_score_results for insert to authenticated with check (public.can_access_medical_record_clinic(clinic_id) and professional_id=auth.uid());
grant select,insert on public.clinical_score_results to authenticated;
commit;
select pg_notify('pgrst','reload schema');
