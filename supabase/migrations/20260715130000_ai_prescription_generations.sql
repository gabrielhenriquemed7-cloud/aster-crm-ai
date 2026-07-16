begin;

create table if not exists public.ai_prescription_generations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  professional_id uuid not null references auth.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  prompt_version text not null,
  model text not null,
  generated_prescription jsonb not null,
  final_prescription jsonb,
  status text not null check (status in ('generated', 'inserted', 'discarded')),
  updated_at timestamptz not null default now()
);

create index if not exists ai_prescription_generations_appointment_idx
  on public.ai_prescription_generations
  (clinic_id, appointment_id, generated_at desc);

alter table public.ai_prescription_generations enable row level security;

drop policy if exists "AI prescription generations select"
  on public.ai_prescription_generations;
drop policy if exists "AI prescription generations insert"
  on public.ai_prescription_generations;
drop policy if exists "AI prescription generations update"
  on public.ai_prescription_generations;

create policy "AI prescription generations select"
  on public.ai_prescription_generations
  for select to authenticated
  using (public.can_access_medical_record_clinic(clinic_id));

create policy "AI prescription generations insert"
  on public.ai_prescription_generations
  for insert to authenticated
  with check (
    public.can_access_medical_record_clinic(clinic_id)
    and professional_id = auth.uid()
  );

create policy "AI prescription generations update"
  on public.ai_prescription_generations
  for update to authenticated
  using (
    public.can_access_medical_record_clinic(clinic_id)
    and professional_id = auth.uid()
  )
  with check (
    public.can_access_medical_record_clinic(clinic_id)
    and professional_id = auth.uid()
  );

grant select, insert, update on public.ai_prescription_generations
  to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
