begin;

alter table public.appointments
  add column if not exists check_in_at timestamptz,
  add column if not exists checked_in_by uuid,
  add column if not exists waiting_since timestamptz,
  add column if not exists called_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists arrival_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_checked_in_by_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_checked_in_by_fkey
      foreign key (checked_in_by) references auth.users(id)
      on delete restrict not valid;
  end if;
end
$$;

create index if not exists appointments_reception_queue_idx
  on public.appointments(clinic_id, appointment_date, status, waiting_since);

create or replace function public.advance_reception_appointment(
  target_appointment_id uuid,
  target_status public.appointment_status_v1,
  reception_notes text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
begin
  select appointment.* into source
  from public.appointments appointment
  join public.profiles profile
    on profile.id = current_user_id
   and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member
    on member.clinic_id = appointment.clinic_id
   and member.user_id = current_user_id
   and member.status = 'active'
  where appointment.id = target_appointment_id
  for update of appointment;

  if source.id is null then
    raise exception using errcode = '42501', message = 'Agendamento não encontrado na clínica ativa.';
  end if;

  if target_status = 'confirmed' then
    if source.check_in_at is not null then
      raise exception using errcode = '22023', message = 'O check-in deste paciente já foi realizado.';
    end if;
    if source.status in ('cancelled', 'no_show') then
      raise exception using errcode = '22023', message = 'Não é possível fazer check-in de uma consulta cancelada ou marcada como falta.';
    end if;
    if source.status not in ('scheduled', 'confirmed') then
      raise exception using errcode = '22023', message = 'A consulta precisa estar agendada ou confirmada para registrar a chegada.';
    end if;

    update public.appointments
    set status = 'confirmed',
        check_in_at = now(),
        checked_in_by = current_user_id,
        arrival_notes = nullif(trim(reception_notes), ''),
        updated_at = now()
    where id = source.id
    returning * into source;

    insert into public.clinic_audit_logs(clinic_id, actor_id, event_type, metadata)
    values (source.clinic_id, current_user_id, 'patient_checked_in', jsonb_build_object('appointment_id', source.id, 'patient_id', source.patient_id));
  elsif target_status = 'waiting' then
    if source.status = 'waiting' or source.waiting_since is not null then
      raise exception using errcode = '22023', message = 'O paciente já está na fila de espera.';
    end if;
    if source.status <> 'confirmed' or source.check_in_at is null then
      raise exception using errcode = '22023', message = 'Confirme a chegada antes de encaminhar o paciente para a fila.';
    end if;

    update public.appointments
    set status = 'waiting',
        waiting_since = now(),
        arrival_notes = coalesce(nullif(trim(reception_notes), ''), arrival_notes),
        updated_at = now()
    where id = source.id
    returning * into source;

    insert into public.clinic_audit_logs(clinic_id, actor_id, event_type, metadata)
    values (source.clinic_id, current_user_id, 'waiting_room_entered', jsonb_build_object('appointment_id', source.id, 'patient_id', source.patient_id));
  else
    raise exception using errcode = '22023', message = 'Transição inválida para a Recepção.';
  end if;

  return source;
end;
$$;

revoke all on function public.advance_reception_appointment(uuid, public.appointment_status_v1, text) from public;
grant execute on function public.advance_reception_appointment(uuid, public.appointment_status_v1, text) to authenticated;

commit;
select pg_notify('pgrst', 'reload schema');
