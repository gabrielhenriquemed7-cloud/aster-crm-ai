create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  full_name text not null,
  cpf text,
  cns text,
  birth_date date,
  gender text,
  marital_status text,
  occupation text,
  zip_code text,
  address text,
  city text,
  state text,
  phone text,
  whatsapp text,
  email text,
  insurance text,
  insurance_card text,
  emergency_contact text,
  allergies text,
  comorbidities text,
  notes text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_cpf_length check (cpf is null or length(regexp_replace(cpf, '\\D', '', 'g')) = 11)
);

create index if not exists patients_user_id_idx on public.patients(user_id);
create index if not exists patients_full_name_idx on public.patients(user_id, full_name);
create index if not exists patients_cpf_idx on public.patients(user_id, cpf);

alter table public.patients enable row level security;

create policy "Users manage their own patients"
  on public.patients for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger patients_set_updated_at
  before update on public.patients
  for each row execute procedure public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('patient-photos', 'patient-photos', true)
on conflict (id) do nothing;

create policy "Users upload their patient photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users update their patient photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete their patient photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Patient photos are publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'patient-photos');
