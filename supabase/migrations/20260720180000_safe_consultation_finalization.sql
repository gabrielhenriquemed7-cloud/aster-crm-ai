begin;

alter table public.appointments
  add column if not exists finalized_version bigint,
  add column if not exists finalization_summary jsonb,
  add column if not exists finalization_metadata jsonb not null default '{}'::jsonb,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id) on delete restrict,
  add column if not exists reopening_reason text,
  add column if not exists has_addendum boolean not null default false;

create table if not exists public.consultation_finalization_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  medical_record_id uuid references public.medical_records(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('requested','finalized','failed','reopened','addendum_created','return_scheduled')),
  previous_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists consultation_finalization_once_idx
  on public.consultation_finalization_events(appointment_id, event_type) where event_type = 'finalized';
create index if not exists consultation_finalization_events_idx
  on public.consultation_finalization_events(clinic_id, appointment_id, created_at desc);

alter table public.consultation_finalization_events enable row level security;
drop policy if exists "Clinic members read finalization events" on public.consultation_finalization_events;
create policy "Clinic members read finalization events" on public.consultation_finalization_events for select to authenticated
using (public.is_active_clinic_member(clinic_id));
grant select on public.consultation_finalization_events to authenticated;

create or replace function public.finalize_clinical_encounter_safe(
  target_appointment_id uuid,
  lock_token uuid,
  expected_autosave_version bigint,
  acknowledge_alerts boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  target_record public.medical_records%rowtype;
  draft_documents integer;
  has_prescription_draft boolean;
  duration_seconds integer;
  summary jsonb;
begin
  select appointment.* into source from public.appointments appointment
  join public.profiles profile on profile.id = current_user_id and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member on member.clinic_id = appointment.clinic_id and member.user_id = current_user_id and member.status = 'active' and member.role in ('doctor','clinic_admin')
  where appointment.id = target_appointment_id for update of appointment;
  if source.id is null then raise exception using errcode='42501', message='Consulta não encontrada na clínica ativa.'; end if;
  if source.professional_id <> current_user_id then raise exception using errcode='42501', message='Somente o profissional responsável pode finalizar a consulta.'; end if;
  if source.status = 'completed' then return jsonb_build_object('already_finalized', true, 'appointment_id', source.id, 'finished_at', coalesce(source.finished_at, source.completed_at)); end if;
  if source.status <> 'in_progress' then raise exception using errcode='22023', message='A consulta precisa estar em atendimento para ser finalizada.'; end if;
  if source.consultation_lock_token is distinct from lock_token or source.consultation_lock_until < now() then raise exception using errcode='55P03', message='A consulta foi alterada em outra aba ou a sessão expirou.'; end if;

  select * into target_record from public.medical_records where appointment_id = source.id and deleted_at is null for update;
  if target_record.id is null then raise exception using errcode='23514', message='Salve o prontuário antes de finalizar.'; end if;
  if target_record.autosave_version is distinct from expected_autosave_version then raise exception using errcode='40001', message='Existem alterações mais recentes. Atualize a consulta antes de finalizar.'; end if;
  if nullif(trim(target_record.chief_complaint), '') is null or nullif(trim(target_record.assessment), '') is null or nullif(trim(target_record.plan), '') is null then
    raise exception using errcode='23514', message='Preencha motivo da consulta, avaliação e conduta antes de finalizar.';
  end if;

  select count(*) into draft_documents from public.clinical_documents where appointment_id = source.id and status in ('draft','in_review') and deleted_at is null;
  has_prescription_draft := target_record.prescription_draft is not null and jsonb_array_length(coalesce(target_record.prescription_draft->'medications', '[]'::jsonb)) > 0;
  if (draft_documents > 0 or has_prescription_draft) and not acknowledge_alerts then
    raise exception using errcode='P0001', message='Existem documentos ou prescrições em rascunho. Confirme os alertas para finalizar.';
  end if;

  insert into public.consultation_finalization_events(clinic_id, appointment_id, medical_record_id, actor_id, event_type, previous_status, new_status, metadata)
  values(source.clinic_id, source.id, target_record.id, current_user_id, 'requested', source.status::text, 'completed', jsonb_build_object('autosave_version', target_record.autosave_version, 'alerts_acknowledged', acknowledge_alerts));

  duration_seconds := greatest(0, extract(epoch from (now() - coalesce(source.consultation_started_at, source.started_at, now())))::integer);
  summary := jsonb_strip_nulls(jsonb_build_object(
    'chief_complaint', target_record.chief_complaint, 'hpi', target_record.hpi, 'physical_exam', target_record.physical_exam,
    'assessment', target_record.assessment, 'cid10', target_record.cid10, 'plan', target_record.plan,
    'prescription', target_record.prescription, 'exam_requests', target_record.exam_requests,
    'guidance', target_record.guidance, 'return_guidance', target_record.return_guidance,
    'documents_count', (select count(*) from public.clinical_documents where appointment_id = source.id and deleted_at is null)
  ));

  update public.medical_records set status='finalized', finalized_at=now(), finalized_by=current_user_id, last_saved_at=now(), updated_at=now() where id=target_record.id;
  update public.appointments set status='completed', completed_at=now(), completed_by=current_user_id,
    finished_at=now(), finalized_version=target_record.autosave_version, finalization_summary=summary,
    finalization_metadata=jsonb_build_object('previous_status', source.status, 'new_status', 'completed', 'draft_documents', draft_documents, 'prescription_draft', has_prescription_draft),
    consultation_duration_seconds=duration_seconds, consultation_last_activity=now(), consultation_locked_by=null, consultation_lock_until=null, consultation_lock_token=null, updated_at=now()
  where id=source.id;

  insert into public.consultation_finalization_events(clinic_id, appointment_id, medical_record_id, actor_id, event_type, previous_status, new_status, metadata)
  values(source.clinic_id, source.id, target_record.id, current_user_id, 'finalized', source.status::text, 'completed', jsonb_build_object('duration_seconds', duration_seconds, 'version', target_record.autosave_version));
  insert into public.clinic_audit_logs(clinic_id, actor_id, event_type, metadata)
  values(source.clinic_id, current_user_id, 'consultation_finalized', jsonb_build_object('appointment_id', source.id, 'previous_status', source.status, 'new_status', 'completed', 'duration_seconds', duration_seconds));
  return jsonb_build_object('already_finalized', false, 'appointment_id', source.id, 'record_id', target_record.id, 'duration_seconds', duration_seconds, 'finished_at', now());
end $$;

create or replace function public.mark_appointment_has_addendum()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_appointment uuid;
begin
  select appointment_id into target_appointment from public.medical_records where id = new.medical_record_id;
  update public.appointments set has_addendum=true where id=target_appointment;
  insert into public.consultation_finalization_events(clinic_id, appointment_id, medical_record_id, actor_id, event_type, previous_status, new_status, metadata)
  values(new.clinic_id, target_appointment, new.medical_record_id, new.created_by, 'addendum_created', 'completed', 'completed', jsonb_build_object('addendum_id', new.id, 'reason', new.reason));
  return new;
end $$;
drop trigger if exists medical_record_addenda_mark_appointment on public.medical_record_addenda;
create trigger medical_record_addenda_mark_appointment after insert on public.medical_record_addenda
for each row execute function public.mark_appointment_has_addendum();

create or replace function public.create_medical_record_addendum(target_record_id uuid, addendum_content text, addendum_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare current_user_id uuid := auth.uid(); source public.medical_records%rowtype; source_appointment public.appointments%rowtype; new_id uuid;
begin
  select * into source from public.medical_records where id=target_record_id and deleted_at is null;
  if source.id is null or source.status not in ('finalized','amended') then raise exception using errcode='22023', message='Apenas prontuários finalizados aceitam adendos.'; end if;
  select * into source_appointment from public.appointments where id=source.appointment_id;
  if not public.is_active_clinic_member(source.clinic_id) or not (source_appointment.professional_id=current_user_id or exists(select 1 from public.clinic_members where clinic_id=source.clinic_id and user_id=current_user_id and status='active' and role='clinic_admin')) then
    raise exception using errcode='42501', message='Somente o médico responsável ou administrador da clínica pode registrar adendo.';
  end if;
  if nullif(trim(addendum_content),'') is null or nullif(trim(addendum_reason),'') is null then raise exception using errcode='23514', message='Informe o conteúdo e a justificativa do adendo.'; end if;
  insert into public.medical_record_addenda(medical_record_id,clinic_id,content,reason,created_by)
  values(source.id,source.clinic_id,trim(addendum_content),trim(addendum_reason),current_user_id) returning id into new_id;
  return new_id;
end $$;

revoke all on function public.finalize_clinical_encounter_safe(uuid,uuid,bigint,boolean) from public;
grant execute on function public.finalize_clinical_encounter_safe(uuid,uuid,bigint,boolean) to authenticated;
grant execute on function public.create_medical_record_addendum(uuid,text,text) to authenticated;

create or replace function public.record_consultation_finalization_failure(target_appointment_id uuid, failure_code text)
returns void language plpgsql security definer set search_path = public as $$
declare source public.appointments%rowtype;
begin
  select appointment.* into source from public.appointments appointment
  join public.profiles profile on profile.id=auth.uid() and profile.active_clinic_id=appointment.clinic_id
  join public.clinic_members member on member.clinic_id=appointment.clinic_id and member.user_id=auth.uid() and member.status='active'
  where appointment.id=target_appointment_id;
  if source.id is null then return; end if;
  insert into public.consultation_finalization_events(clinic_id,appointment_id,actor_id,event_type,previous_status,new_status,metadata)
  values(source.clinic_id,source.id,auth.uid(),'failed',source.status::text,source.status::text,jsonb_build_object('failure_code',left(coalesce(failure_code,'unknown'),80)));
end $$;
revoke all on function public.record_consultation_finalization_failure(uuid,text) from public;
grant execute on function public.record_consultation_finalization_failure(uuid,text) to authenticated;

commit;
select pg_notify('pgrst', 'reload schema');
