create type public.appointment_status as enum ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  appointment_type text not null default 'Consulta',
  notes text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_valid_interval check (ends_at > starts_at)
);

create index appointments_user_starts_at_idx on public.appointments(user_id, starts_at);
create index appointments_patient_id_idx on public.appointments(patient_id);
create index appointments_doctor_starts_at_idx on public.appointments(doctor_id, starts_at);

alter table public.appointments enable row level security;

create policy "Users manage their own appointments"
  on public.appointments for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute procedure public.set_updated_at();
