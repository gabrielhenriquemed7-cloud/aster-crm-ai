begin;

alter table public.appointments
  add column if not exists attendance_started_at timestamptz,
  add column if not exists attendance_started_by uuid,
  add column if not exists consultation_started_at timestamptz,
  add column if not exists consultation_last_activity timestamptz,
  add column if not exists consultation_locked_by uuid,
  add column if not exists consultation_lock_until timestamptz,
  add column if not exists consultation_lock_token uuid,
  add column if not exists consultation_duration_seconds integer;

alter table public.medical_records
  add column if not exists autosave_version bigint not null default 0,
  add column if not exists draft_state jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_attendance_started_by_fkey') then
    alter table public.appointments add constraint appointments_attendance_started_by_fkey foreign key (attendance_started_by) references auth.users(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_consultation_locked_by_fkey') then
    alter table public.appointments add constraint appointments_consultation_locked_by_fkey foreign key (consultation_locked_by) references auth.users(id) on delete restrict not valid;
  end if;
end
$$;

create index if not exists appointments_open_consultation_idx
  on public.appointments(clinic_id, professional_id, status, consultation_last_activity);

create or replace function public.finish_consultation_session()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.finished_at := coalesce(new.finished_at, now());
    new.consultation_duration_seconds := greatest(0, extract(epoch from (new.finished_at - coalesce(new.consultation_started_at, new.started_at, new.finished_at)))::integer);
    new.consultation_last_activity := now();
    new.consultation_locked_by := null;
    new.consultation_lock_until := null;
    new.consultation_lock_token := null;
  end if;
  return new;
end $$;

drop trigger if exists appointments_finish_consultation_session on public.appointments;
create trigger appointments_finish_consultation_session before update of status on public.appointments
for each row execute function public.finish_consultation_session();

create or replace function public.open_or_resume_consultation(target_appointment_id uuid, lock_token uuid)
returns public.appointments
language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  was_recovery boolean;
begin
  if lock_token is null then raise exception using errcode = '22023', message = 'Sessão de edição inválida.'; end if;
  select appointment.* into source from public.appointments appointment
  join public.profiles profile on profile.id = current_user_id and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member on member.clinic_id = appointment.clinic_id and member.user_id = current_user_id and member.status = 'active'
  where appointment.id = target_appointment_id for update of appointment;
  if source.id is null then raise exception using errcode = '42501', message = 'Consulta não encontrada na clínica ativa.'; end if;
  if source.professional_id <> current_user_id then raise exception using errcode = '42501', message = 'Somente o profissional responsável pode iniciar o atendimento.'; end if;
  if source.status not in ('waiting', 'in_progress') then raise exception using errcode = '22023', message = 'A consulta precisa estar aguardando ou em atendimento.'; end if;
  was_recovery := source.status = 'in_progress';
  if source.consultation_lock_until > now() and source.consultation_lock_token is distinct from lock_token then
    raise exception using errcode = '55P03', message = 'Esta consulta já está aberta para edição em outra aba.';
  end if;

  update public.appointments set
    status = 'in_progress',
    started_at = coalesce(started_at, now()),
    attendance_started_at = coalesce(attendance_started_at, now()),
    attendance_started_by = coalesce(attendance_started_by, current_user_id),
    consultation_started_at = coalesce(consultation_started_at, now()),
    consultation_last_activity = now(),
    consultation_locked_by = current_user_id,
    consultation_lock_until = now() + interval '90 seconds',
    consultation_lock_token = lock_token,
    called_at = coalesce(called_at, now()),
    updated_at = now()
  where id = source.id returning * into source;

  insert into public.medical_records(appointment_id, clinic_id, patient_id, professional_id, status, last_saved_at)
  values(source.id, source.clinic_id, source.patient_id, source.professional_id, 'draft', now())
  on conflict (appointment_id) where deleted_at is null do update set appointment_id = excluded.appointment_id;

  insert into public.clinic_audit_logs(clinic_id, actor_id, event_type, metadata)
  values(source.clinic_id, current_user_id, case when was_recovery then 'consultation_recovered' else 'consultation_started' end, jsonb_build_object('appointment_id', source.id, 'patient_id', source.patient_id));
  return source;
end $$;

create or replace function public.renew_consultation_lock(target_appointment_id uuid, lock_token uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare lock_expiry timestamptz;
begin
  update public.appointments set consultation_lock_until = now() + interval '90 seconds', consultation_last_activity = now()
  where id = target_appointment_id and professional_id = auth.uid() and status = 'in_progress' and consultation_lock_token = lock_token
    and public.is_active_clinic_member(clinic_id)
  returning consultation_lock_until into lock_expiry;
  if lock_expiry is null then raise exception using errcode = '55P03', message = 'A sessão de edição expirou ou está ativa em outra aba.'; end if;
  return lock_expiry;
end $$;

create or replace function public.autosave_consultation_draft(target_appointment_id uuid, lock_token uuid, draft jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare target_record_id uuid; next_version bigint;
begin
  perform public.renew_consultation_lock(target_appointment_id, lock_token);
  select id into target_record_id from public.medical_records where appointment_id = target_appointment_id and status = 'draft' and deleted_at is null for update;
  if target_record_id is null then raise exception using errcode = '22023', message = 'Rascunho da consulta não encontrado.'; end if;
  update public.medical_records set
    chief_complaint = nullif(trim(draft->>'chief_complaint'), ''), hpi = nullif(trim(draft->>'hpi'), ''),
    pmh = nullif(trim(draft->>'pmh'), ''), medications = nullif(trim(draft->>'medications'), ''), allergies = nullif(trim(draft->>'allergies'), ''),
    family_history = nullif(trim(draft->>'family_history'), ''), social_history = nullif(trim(draft->>'social_history'), ''),
    physical_exam = nullif(trim(draft->>'physical_exam'), ''), vital_signs = nullif(trim(draft->>'vital_signs'), ''),
    assessment = nullif(trim(draft->>'assessment'), ''), cid10 = nullif(trim(draft->>'cid10'), ''), plan = nullif(trim(draft->>'plan'), ''),
    prescription = nullif(trim(draft->>'prescription'), ''), exam_requests = nullif(trim(draft->>'exam_requests'), ''),
    certificate = nullif(trim(draft->>'certificate'), ''), guidance = nullif(trim(draft->>'guidance'), ''), return_guidance = nullif(trim(draft->>'return_guidance'), ''),
    draft_state = draft, autosave_version = autosave_version + 1, last_saved_at = now(), updated_at = now()
  where id = target_record_id returning autosave_version into next_version;
  update public.appointments set consultation_last_activity = now() where id = target_appointment_id;
  return next_version;
end $$;

revoke all on function public.open_or_resume_consultation(uuid, uuid) from public;
revoke all on function public.renew_consultation_lock(uuid, uuid) from public;
revoke all on function public.autosave_consultation_draft(uuid, uuid, jsonb) from public;
grant execute on function public.open_or_resume_consultation(uuid, uuid) to authenticated;
grant execute on function public.renew_consultation_lock(uuid, uuid) to authenticated;
grant execute on function public.autosave_consultation_draft(uuid, uuid, jsonb) to authenticated;

commit;
select pg_notify('pgrst', 'reload schema');
