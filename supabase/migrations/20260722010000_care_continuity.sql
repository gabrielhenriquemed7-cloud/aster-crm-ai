begin;

create table if not exists public.care_continuity_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  professional_id uuid not null references auth.users(id) on delete restrict,
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_sector text,
  item_type text not null check (item_type in ('follow_up','referral','exam','exam_result','document','conduct','other')),
  title text not null check (length(trim(title)) > 0),
  description text,
  priority text not null default 'routine' check (priority in ('routine','preferred','priority','urgent')),
  status text not null default 'pending' check (status in ('recommended','pending','scheduled','confirmed','in_progress','result_available','reviewed','completed','cancelled','dismissed','no_show')),
  due_at timestamptz,
  scheduled_appointment_id uuid references public.appointments(id) on delete set null,
  clinical_document_id uuid references public.clinical_documents(id) on delete set null,
  source_key text not null,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, appointment_id, source_key)
);

create table if not exists public.care_continuity_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  continuity_item_id uuid not null references public.care_continuity_items(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('created','assigned','status_changed','scheduled','contact_recorded','completed','cancelled','reopened','result_received','result_reviewed')),
  previous_status text,
  new_status text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists care_continuity_clinic_status_due_idx
  on public.care_continuity_items(clinic_id, status, due_at);
create index if not exists care_continuity_patient_idx
  on public.care_continuity_items(clinic_id, patient_id, created_at desc);
create index if not exists care_continuity_assigned_idx
  on public.care_continuity_items(clinic_id, assigned_to, status);
create index if not exists care_continuity_events_item_idx
  on public.care_continuity_events(continuity_item_id, created_at desc);

alter table public.care_continuity_items enable row level security;
alter table public.care_continuity_events enable row level security;

create policy "Clinic members read continuity items" on public.care_continuity_items
  for select to authenticated using (public.is_active_clinic_member(clinic_id));
create policy "Doctors manage continuity items" on public.care_continuity_items
  for all to authenticated using (
    clinic_id = public.active_clinic_id() and exists (
      select 1 from public.clinic_members member
      where member.clinic_id = care_continuity_items.clinic_id
        and member.user_id = auth.uid() and member.status = 'active'
        and member.role in ('doctor','clinic_admin')
    )
  ) with check (
    clinic_id = public.active_clinic_id() and exists (
      select 1 from public.clinic_members member
      where member.clinic_id = care_continuity_items.clinic_id
        and member.user_id = auth.uid() and member.status = 'active'
        and member.role in ('doctor','clinic_admin')
    )
  );
create policy "Clinic members read continuity events" on public.care_continuity_events
  for select to authenticated using (public.is_active_clinic_member(clinic_id));

grant select, insert, update on public.care_continuity_items to authenticated;
grant select on public.care_continuity_events to authenticated;

create or replace function public.audit_care_continuity_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare event_name text;
begin
  if tg_op = 'INSERT' then event_name := 'created';
  elsif new.status = 'completed' and old.status <> 'completed' then event_name := 'completed';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then event_name := 'cancelled';
  elsif old.status in ('completed','cancelled') and new.status = 'pending' then event_name := 'reopened';
  elsif new.assigned_to is distinct from old.assigned_to or new.assigned_sector is distinct from old.assigned_sector then event_name := 'assigned';
  elsif new.status is distinct from old.status then event_name := 'status_changed';
  else return new;
  end if;
  insert into public.care_continuity_events(clinic_id,continuity_item_id,actor_id,event_type,previous_status,new_status,notes)
  values(new.clinic_id,new.id,auth.uid(),event_name,case when tg_op='UPDATE' then old.status end,new.status,
    case when event_name in ('cancelled','reopened') then new.cancellation_reason end);
  return new;
end $$;

drop trigger if exists care_continuity_audit on public.care_continuity_items;
create trigger care_continuity_audit after insert or update on public.care_continuity_items
for each row execute function public.audit_care_continuity_change();

create or replace function public.create_encounter_continuity_items(target_appointment_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  record public.medical_records%rowtype;
  inserted_count integer := 0;
  document_count integer := 0;
begin
  select appointment.* into source from public.appointments appointment
  join public.profiles profile on profile.id = current_user_id and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member on member.clinic_id = appointment.clinic_id and member.user_id = current_user_id and member.status = 'active' and member.role in ('doctor','clinic_admin')
  where appointment.id = target_appointment_id;
  if source.id is null or source.professional_id <> current_user_id then
    raise exception using errcode = '42501', message = 'Sem permissão para criar o plano de continuidade.';
  end if;
  if source.status <> 'completed' then
    raise exception using errcode = '22023', message = 'Finalize a consulta antes de criar pendências.';
  end if;
  select * into record from public.medical_records where appointment_id = source.id and clinic_id = source.clinic_id and deleted_at is null;

  if nullif(trim(record.return_guidance), '') is not null then
    insert into public.care_continuity_items(clinic_id,patient_id,appointment_id,professional_id,item_type,title,description,status,source_key)
    values(source.clinic_id,source.patient_id,source.id,source.professional_id,'follow_up','Retorno recomendado',record.return_guidance,'recommended','record:return_guidance')
    on conflict (clinic_id,appointment_id,source_key) do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end if;
  if nullif(trim(record.exam_requests), '') is not null then
    insert into public.care_continuity_items(clinic_id,patient_id,appointment_id,professional_id,item_type,title,description,status,source_key)
    values(source.clinic_id,source.patient_id,source.id,source.professional_id,'exam','Exames solicitados',record.exam_requests,'pending','record:exam_requests')
    on conflict (clinic_id,appointment_id,source_key) do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end if;
  insert into public.care_continuity_items(clinic_id,patient_id,appointment_id,professional_id,item_type,title,description,status,clinical_document_id,source_key)
  select source.clinic_id,source.patient_id,source.id,source.professional_id,
    case document.document_type when 'referral' then 'referral' else 'exam' end,
    document.title, nullif(document.content ->> 'body',''), 'pending', document.id, 'document:' || document.id::text
  from public.clinical_documents document
  where document.clinic_id = source.clinic_id and document.appointment_id = source.id
    and document.document_type in ('referral','exam_request')
    and document.status in ('finalized','signed','archived') and document.deleted_at is null
  on conflict (clinic_id,appointment_id,source_key) do nothing;
  get diagnostics document_count = row_count;
  inserted_count := inserted_count + document_count;
  return inserted_count;
end $$;

revoke all on function public.create_encounter_continuity_items(uuid) from public;
grant execute on function public.create_encounter_continuity_items(uuid) to authenticated;

commit;
select pg_notify('pgrst', 'reload schema');
