begin;

create table if not exists public.clinical_transcription_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null check (
    status in (
      'consent_confirmed',
      'transcription_requested',
      'transcription_completed',
      'transcription_failed',
      'transcription_cancelled'
    )
  ),
  consent_confirmed boolean not null default false,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  model text,
  created_at timestamptz not null default now()
);

create index if not exists clinical_transcription_events_appointment_idx
  on public.clinical_transcription_events (clinic_id, appointment_id, created_at desc);

alter table public.clinical_transcription_events enable row level security;

drop policy if exists "Clinical transcription events select"
  on public.clinical_transcription_events;
drop policy if exists "Clinical transcription events insert"
  on public.clinical_transcription_events;

create policy "Clinical transcription events select"
  on public.clinical_transcription_events
  for select to authenticated
  using (public.can_access_medical_record_clinic(clinic_id));

create policy "Clinical transcription events insert"
  on public.clinical_transcription_events
  for insert to authenticated
  with check (
    public.can_access_medical_record_clinic(clinic_id)
    and requested_by = auth.uid()
  );

grant select, insert on public.clinical_transcription_events to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
