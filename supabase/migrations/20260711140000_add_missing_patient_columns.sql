begin;

alter table public.patients add column if not exists social_name text;
alter table public.patients add column if not exists rg text;
alter table public.patients add column if not exists race_ethnicity text;
alter table public.patients add column if not exists nationality text;
alter table public.patients add column if not exists birthplace text;
alter table public.patients add column if not exists mother_name text;
alter table public.patients add column if not exists father_name text;
alter table public.patients add column if not exists address_number text;
alter table public.patients add column if not exists address_complement text;
alter table public.patients add column if not exists neighborhood text;
alter table public.patients add column if not exists emergency_contact_name text;
alter table public.patients add column if not exists emergency_contact_phone text;
alter table public.patients add column if not exists emergency_contact_relationship text;
alter table public.patients add column if not exists blood_type text;
alter table public.patients add column if not exists continuous_medications text;
alter table public.patients add column if not exists medical_history text;
alter table public.patients add column if not exists deleted_at timestamptz;
alter table public.patients add column if not exists deleted_by uuid;

create index if not exists patients_active_clinic_name_idx
  on public.patients (clinic_id, full_name)
  where deleted_at is null;

create index if not exists patients_active_clinic_social_name_idx
  on public.patients (clinic_id, social_name)
  where deleted_at is null;

create index if not exists patients_active_clinic_cpf_idx
  on public.patients (clinic_id, cpf)
  where deleted_at is null;

create index if not exists patients_clinic_deleted_at_idx
  on public.patients (clinic_id, deleted_at);

commit;

select pg_notify('pgrst', 'reload schema');
