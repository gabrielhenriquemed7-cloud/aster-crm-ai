begin;

do $$
begin
  if exists (
    select 1 from public.clinic_invites
    where status not in ('pending','sent','failed','accepted','expired','cancelled','revoked')
  ) then
    raise exception using errcode = '23514',
      message = 'Existem convites com status desconhecido; consolidação cancelada.';
  end if;
end;
$$;

alter table public.clinic_invites
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text,
  add column if not exists delivery_error_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.clinic_invites drop constraint if exists clinic_invites_status_check;
alter table public.clinic_invites add constraint clinic_invites_status_check
  check (status in ('pending','sent','failed','accepted','expired','cancelled','revoked'));

create unique index if not exists clinic_invites_open_email_idx
  on public.clinic_invites (clinic_id, lower(email))
  where status in ('pending','sent','failed');

create or replace function public.create_clinic_invite(
  invite_email text,
  invite_full_name text,
  invite_role text,
  invite_metadata jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  normalized_email text := lower(trim(invite_email));
  selected_role public.clinic_member_role;
  invitation_id uuid;
begin
  if selected_clinic_id is null then raise exception using errcode='42501',message='Sem permissão para convidar usuários nesta clínica.'; end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception using errcode='22023',message='Informe um e-mail válido.'; end if;
  if invite_role not in ('clinic_admin','doctor','secretary','receptionist') then raise exception using errcode='42501',message='Papel inválido para um usuário da clínica.'; end if;
  selected_role := invite_role::public.clinic_member_role;
  if selected_role = 'doctor' and (
    nullif(trim(coalesce(invite_metadata->>'council',invite_metadata->>'council_type')),'') is null or
    nullif(trim(invite_metadata->>'council_number'),'') is null or
    nullif(trim(invite_metadata->>'council_state'),'') is null
  ) then raise exception using errcode='22023',message='Informe conselho, número e UF para o médico.'; end if;
  if exists (
    select 1 from public.clinic_members cm join auth.users u on u.id=cm.user_id
    where cm.clinic_id=selected_clinic_id and lower(u.email)=normalized_email and cm.status='active'
  ) then raise exception using errcode='23505',message='Este profissional já possui acesso à clínica.'; end if;
  if exists (
    select 1 from public.clinic_invites ci where ci.clinic_id=selected_clinic_id
      and lower(ci.email)=normalized_email and ci.status in ('pending','sent','failed') and ci.expires_at>now()
  ) then raise exception using errcode='23505',message='Já existe um convite pendente para este e-mail.'; end if;
  update public.clinic_invites ci set status='expired',updated_at=now()
  where ci.clinic_id=selected_clinic_id and lower(ci.email)=normalized_email
    and ci.status in ('pending','sent','failed') and ci.expires_at<=now();
  insert into public.clinic_invites(clinic_id,email,full_name,role,created_by,metadata)
  values(selected_clinic_id,normalized_email,nullif(trim(invite_full_name),''),selected_role,auth.uid(),
    jsonb_strip_nulls(jsonb_build_object(
      'specialty',nullif(trim(invite_metadata->>'specialty'),''),
      'council',nullif(trim(coalesce(invite_metadata->>'council',invite_metadata->>'council_type')),''),
      'council_number',nullif(trim(invite_metadata->>'council_number'),''),
      'council_state',upper(nullif(trim(invite_metadata->>'council_state'),'')),
      'phone',nullif(trim(invite_metadata->>'phone'),'')
    ))) returning id into invitation_id;
  insert into public.clinic_audit_logs(clinic_id,actor_id,event_type,metadata)
  values(selected_clinic_id,auth.uid(),'professional_invited',jsonb_build_object(
    'invitation_id',invitation_id,'role',selected_role,'email_domain',split_part(normalized_email,'@',2)));
  return invitation_id;
end;
$$;

create or replace function public.record_clinic_invite_delivery(
  invite_id uuid, delivery_succeeded boolean, delivery_code text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare selected_clinic_id uuid := public.current_clinic_admin_id(); old_status text; new_status text;
begin
  if selected_clinic_id is null then raise exception using errcode='42501',message='Sem permissão para atualizar convites.'; end if;
  select ci.status into old_status from public.clinic_invites ci
  where ci.id=invite_id and ci.clinic_id=selected_clinic_id for update;
  if not found then raise exception using errcode='42501',message='Convite não encontrado nesta clínica.'; end if;
  if old_status not in ('pending','sent','failed') then raise exception using errcode='22023',message='Este convite não pode mais ter sua entrega atualizada.'; end if;
  new_status := case when delivery_succeeded then 'sent' else 'failed' end;
  update public.clinic_invites ci set status=new_status,last_sent_at=now(),send_count=ci.send_count+1,
    delivery_error_code=case when delivery_succeeded then null else left(coalesce(delivery_code,'EMAIL_DELIVERY_FAILED'),80) end,
    updated_at=now()
  where ci.id=invite_id and ci.clinic_id=selected_clinic_id and ci.status in ('pending','sent','failed');
  if not found then raise exception using errcode='22023',message='Este convite não pode mais ter sua entrega atualizada.'; end if;
  insert into public.clinic_audit_logs(clinic_id,actor_id,event_type,metadata)
  values(selected_clinic_id,auth.uid(),case when delivery_succeeded then 'invite_sent' else 'invite_send_failed' end,
    jsonb_build_object('invite_id',invite_id,'previous_status',old_status,'new_status',new_status));
end;
$$;

drop function if exists public.renew_active_clinic_invite(uuid);
create function public.renew_active_clinic_invite(invite_id uuid)
returns table(email text,full_name text,clinic_id uuid,role public.clinic_member_role)
language plpgsql security definer set search_path = public as $$
declare selected_clinic_id uuid := public.current_clinic_admin_id(); last_delivery timestamptz;
begin
  if selected_clinic_id is null then raise exception using errcode='42501',message='Sem permissão para reenviar convites desta clínica.'; end if;
  select ci.last_sent_at into last_delivery from public.clinic_invites ci
  where ci.id=invite_id and ci.clinic_id=selected_clinic_id for update;
  if not found then raise exception using errcode='42501',message='Convite não encontrado nesta clínica.'; end if;
  if last_delivery is not null and last_delivery>now()-interval '60 seconds' then raise exception using errcode='55000',message='Aguarde um minuto antes de reenviar o convite.'; end if;
  return query update public.clinic_invites ci set status='pending',token=gen_random_uuid(),
    expires_at=now()+interval '7 days',delivery_error_code=null,updated_at=now()
  where ci.id=invite_id and ci.clinic_id=selected_clinic_id and ci.status in ('pending','sent','failed','expired')
  returning ci.email,ci.full_name,ci.clinic_id,ci.role;
  if not found then raise exception using errcode='55000',message='Este convite não está disponível para reenvio.'; end if;
end;
$$;

alter function public.renew_active_clinic_invite(uuid) owner to postgres;

drop function if exists public.revoke_active_clinic_invite(uuid);
create or replace function public.revoke_active_clinic_invite(invite_id uuid,reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare selected_clinic_id uuid := public.current_clinic_admin_id(); updated_invite_id uuid;
begin
  if selected_clinic_id is null then raise exception using errcode='42501',message='Sem permissão para cancelar convites desta clínica.'; end if;
  update public.clinic_invites set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
    cancellation_reason=nullif(left(trim(coalesce(reason,'')),500),''),updated_at=now()
  where id=invite_id and clinic_id=selected_clinic_id and status in ('pending','sent','failed','expired')
  returning id into updated_invite_id;
  if updated_invite_id is null then raise exception using errcode='42501',message='Convite não encontrado nesta clínica.'; end if;
  insert into public.clinic_audit_logs(clinic_id,actor_id,event_type,metadata)
  values(selected_clinic_id,auth.uid(),'invite_cancelled',jsonb_build_object('invite_id',invite_id));
end;
$$;

create or replace function public.accept_my_clinic_invite(invite_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare current_user_id uuid:=auth.uid(); current_email text; selected_invite public.clinic_invites%rowtype;
begin
  if current_user_id is null then raise exception using errcode='28000',message='Sua sessão expirou.'; end if;
  select lower(email) into current_email from auth.users where id=current_user_id;
  select * into selected_invite from public.clinic_invites where id=invite_id for update;
  if not found or lower(selected_invite.email)<>current_email then raise exception using errcode='42501',message='Este convite não pertence ao usuário autenticado.'; end if;
  if selected_invite.status='accepted' and selected_invite.auth_user_id=current_user_id then return selected_invite.clinic_id; end if;
  if selected_invite.status in ('cancelled','revoked') then raise exception using errcode='55000',message='Este convite foi cancelado.'; end if;
  if selected_invite.expires_at<=now() then raise exception using errcode='55000',message='Este convite expirou.'; end if;
  if selected_invite.status not in ('pending','sent') then raise exception using errcode='55000',message='Este convite não está disponível para aceite.'; end if;
  insert into public.clinic_members(clinic_id,user_id,role,status,created_by)
  values(selected_invite.clinic_id,current_user_id,selected_invite.role,'invited',selected_invite.created_by)
  on conflict(clinic_id,user_id) do update set role=excluded.role,status=case when clinic_members.status='active' then 'active'::public.clinic_member_status else 'invited'::public.clinic_member_status end;
  update public.clinic_invites set status='accepted',accepted_by=current_user_id,auth_user_id=current_user_id,
    accepted_at=now(),onboarding_started_at=coalesce(onboarding_started_at,now()),updated_at=now() where id=invite_id;
  update public.profiles set full_name=coalesce(nullif(full_name,''),selected_invite.full_name) where id=current_user_id;
  insert into public.clinic_audit_logs(clinic_id,actor_id,target_user_id,event_type,metadata) values
    (selected_invite.clinic_id,current_user_id,current_user_id,'onboarding_started',jsonb_build_object('invitation_id',invite_id)),
    (selected_invite.clinic_id,current_user_id,current_user_id,'invitation_accepted',jsonb_build_object('invitation_id',invite_id));
  return selected_invite.clinic_id;
end;
$$;

create or replace function public.complete_professional_invite_onboarding(invite_id uuid,profile_data jsonb,terms_version text)
returns text language plpgsql security definer set search_path = public as $$
declare current_user_id uuid:=auth.uid(); selected_invite public.clinic_invites%rowtype; destination text;
begin
  if current_user_id is null then raise exception using errcode='28000',message='Sua sessão expirou.'; end if;
  select * into selected_invite from public.clinic_invites
  where id=invite_id and auth_user_id=current_user_id and status='accepted' for update;
  if not found then raise exception using errcode='42501',message='Onboarding não autorizado.'; end if;
  destination:=case selected_invite.role when 'receptionist' then '/recepcao' when 'secretary' then '/appointments' else '/dashboard' end;
  if selected_invite.onboarding_completed_at is not null then return destination; end if;
  if nullif(trim(terms_version),'') is null then raise exception using errcode='22023',message='Aceite os termos e a política de privacidade.'; end if;
  update public.profiles set full_name=coalesce(nullif(trim(profile_data->>'full_name'),''),full_name,selected_invite.full_name),
    phone=coalesce(nullif(trim(profile_data->>'phone'),''),phone),active_clinic_id=selected_invite.clinic_id where id=current_user_id;
  update public.clinic_members set status='active',updated_at=now()
  where clinic_id=selected_invite.clinic_id and user_id=current_user_id and status='invited';
  insert into public.professional_profiles(clinic_id,user_id,professional_name,profession,council,council_number,council_state,specialty,phone,email,photo_url,signature_url,is_active)
  values(selected_invite.clinic_id,current_user_id,coalesce(nullif(trim(profile_data->>'full_name'),''),selected_invite.full_name),
    case when selected_invite.role='doctor' then 'Médico' else selected_invite.role::text end,
    coalesce(nullif(trim(profile_data->>'council'),''),nullif(trim(profile_data->>'council_type'),''),nullif(trim(selected_invite.metadata->>'council'),''),nullif(trim(selected_invite.metadata->>'council_type'),'')),
    coalesce(nullif(trim(profile_data->>'council_number'),''),nullif(trim(selected_invite.metadata->>'council_number'),'')),
    upper(coalesce(nullif(trim(profile_data->>'council_state'),''),nullif(trim(selected_invite.metadata->>'council_state'),''))),
    coalesce(nullif(trim(profile_data->>'specialty'),''),nullif(trim(selected_invite.metadata->>'specialty'),'')),
    coalesce(nullif(trim(profile_data->>'phone'),''),nullif(trim(selected_invite.metadata->>'phone'),'')),selected_invite.email,
    nullif(trim(profile_data->>'photo_url'),''),nullif(trim(profile_data->>'signature_url'),''),true)
  on conflict(clinic_id,user_id) do update set professional_name=excluded.professional_name,profession=excluded.profession,
    council=excluded.council,council_number=excluded.council_number,council_state=excluded.council_state,
    specialty=excluded.specialty,phone=excluded.phone,photo_url=excluded.photo_url,signature_url=excluded.signature_url,is_active=true;
  update public.clinic_invites set onboarding_completed_at=now(),metadata=metadata||jsonb_build_object(
    'terms_version',trim(terms_version),'terms_accepted_at',now()),updated_at=now() where id=invite_id;
  insert into public.clinic_audit_logs(clinic_id,actor_id,target_user_id,event_type,metadata) values
    (selected_invite.clinic_id,current_user_id,current_user_id,'onboarding_completed',jsonb_build_object('invitation_id',invite_id,'terms_version',trim(terms_version))),
    (selected_invite.clinic_id,current_user_id,current_user_id,'user_activated',jsonb_build_object('invitation_id',invite_id));
  return destination;
end;
$$;

drop function if exists public.list_active_clinic_team();
create function public.list_active_clinic_team()
returns table(record_type text,id uuid,user_id uuid,full_name text,email text,role public.clinic_member_role,status text,
  created_at timestamptz,expires_at timestamptz,last_sent_at timestamptz,send_count integer,invited_by text)
language plpgsql stable security definer set search_path = public as $$
declare selected_clinic_id uuid:=public.current_clinic_admin_id();
begin
  if selected_clinic_id is null then raise exception using errcode='42501',message='Sem permissão para administrar esta clínica.'; end if;
  return query
  select 'member'::text,cm.id,cm.user_id,coalesce(nullif(p.full_name,''),u.raw_user_meta_data->>'full_name'),
    coalesce(p.email,u.email)::text,cm.role,cm.status::text,cm.created_at,null::timestamptz,null::timestamptz,0,null::text
  from public.clinic_members cm left join public.profiles p on p.id=cm.user_id left join auth.users u on u.id=cm.user_id
  where cm.clinic_id=selected_clinic_id
  union all
  select 'invite'::text,ci.id,null::uuid,ci.full_name,ci.email,ci.role,
    case when ci.status in ('pending','sent','failed') and ci.expires_at<=now() then 'expired' else ci.status end,
    ci.created_at,ci.expires_at,ci.last_sent_at,ci.send_count,coalesce(inviter.full_name,inviter.email)::text
  from public.clinic_invites ci left join public.profiles inviter on inviter.id=ci.created_by
  where ci.clinic_id=selected_clinic_id and ci.status in ('pending','sent','failed','expired','cancelled')
  order by created_at desc;
end;
$$;

drop policy if exists "Invitees read own pending invites" on public.clinic_invites;
drop policy if exists "Invitees read own invitations" on public.clinic_invites;
create policy "Invitees read own invitations" on public.clinic_invites for select to authenticated
using(lower(email)=lower(coalesce(auth.jwt()->>'email','')));

revoke all on table public.profiles,public.clinics,public.clinic_members,public.clinic_invites,public.clinic_audit_logs from anon;

revoke all on function public.current_clinic_admin_id() from public,anon;
revoke all on function public.create_clinic_invite(text,text,text,jsonb) from public,anon;
revoke all on function public.record_clinic_invite_delivery(uuid,boolean,text) from public,anon;
revoke all on function public.renew_active_clinic_invite(uuid) from public,anon;
revoke all on function public.revoke_active_clinic_invite(uuid,text) from public,anon;
revoke all on function public.accept_my_clinic_invite(uuid) from public,anon;
revoke all on function public.complete_professional_invite_onboarding(uuid,jsonb,text) from public,anon;
revoke all on function public.list_active_clinic_team() from public,anon;
drop function if exists public.accept_my_clinic_invites();

grant execute on function public.current_clinic_admin_id() to authenticated;
grant execute on function public.create_clinic_invite(text,text,text,jsonb) to authenticated;
grant execute on function public.record_clinic_invite_delivery(uuid,boolean,text) to authenticated;
grant execute on function public.renew_active_clinic_invite(uuid) to authenticated;
grant execute on function public.revoke_active_clinic_invite(uuid,text) to authenticated;
grant execute on function public.accept_my_clinic_invite(uuid) to authenticated;
grant execute on function public.complete_professional_invite_onboarding(uuid,jsonb,text) to authenticated;
grant execute on function public.list_active_clinic_team() to authenticated;

notify pgrst,'reload schema';

commit;
