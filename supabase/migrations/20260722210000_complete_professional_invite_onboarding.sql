alter table public.clinic_invites
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

drop function if exists public.create_clinic_invite(text, text, text);
create or replace function public.create_clinic_invite(invite_email text, invite_full_name text, invite_role text, invite_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare selected_clinic_id uuid := public.current_clinic_admin_id(); normalized_email text := lower(trim(invite_email)); selected_role public.clinic_member_role; invite_id uuid;
begin
  if selected_clinic_id is null then raise exception using errcode = '42501', message = 'Sem permissão para convidar usuários nesta clínica.'; end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception using errcode = '22023', message = 'Informe um e-mail válido.'; end if;
  if invite_role not in ('clinic_admin', 'doctor', 'secretary', 'receptionist') then raise exception using errcode = '42501', message = 'Papel inválido para um usuário da clínica.'; end if;
  selected_role := invite_role::public.clinic_member_role;
  if selected_role = 'doctor' and (nullif(trim(invite_metadata ->> 'council'), '') is null or nullif(trim(invite_metadata ->> 'council_number'), '') is null or nullif(trim(invite_metadata ->> 'council_state'), '') is null) then
    raise exception using errcode = '22023', message = 'Informe conselho, número e UF para o médico.';
  end if;
  if exists (select 1 from public.clinic_members cm join auth.users u on u.id = cm.user_id where cm.clinic_id = selected_clinic_id and lower(u.email) = normalized_email and cm.status = 'active') then raise exception using errcode = '23505', message = 'Este profissional já possui acesso à clínica.'; end if;
  if exists (select 1 from public.clinic_invites where clinic_id = selected_clinic_id and lower(email) = normalized_email and status in ('pending','sent','failed') and expires_at > now()) then raise exception using errcode = '23505', message = 'Já existe um convite pendente para este e-mail.'; end if;
  update public.clinic_invites set status = 'expired' where clinic_id = selected_clinic_id and lower(email) = normalized_email and status in ('pending','sent','failed') and expires_at <= now();
  insert into public.clinic_invites(clinic_id,email,full_name,role,created_by,metadata) values(selected_clinic_id,normalized_email,nullif(trim(invite_full_name),''),selected_role,auth.uid(),
    jsonb_strip_nulls(jsonb_build_object('specialty',nullif(trim(invite_metadata->>'specialty'),''),'council',nullif(trim(invite_metadata->>'council'),''),'council_number',nullif(trim(invite_metadata->>'council_number'),''),'council_state',upper(nullif(trim(invite_metadata->>'council_state'),'')),'phone',nullif(trim(invite_metadata->>'phone'),'')))) returning id into invite_id;
  insert into public.clinic_audit_logs(clinic_id,actor_id,event_type,metadata) values(selected_clinic_id,auth.uid(),'professional_invited',jsonb_build_object('invitation_id',invite_id,'role',selected_role,'email_domain',split_part(normalized_email,'@',2)));
  return invite_id;
end; $$;

create or replace function public.accept_my_clinic_invite(invite_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare current_user_id uuid := auth.uid(); current_email text; selected_invite public.clinic_invites%rowtype;
begin
  if current_user_id is null then raise exception using errcode='28000',message='Sua sessão expirou.'; end if;
  select lower(email) into current_email from auth.users where id=current_user_id;
  select * into selected_invite from public.clinic_invites where id=invite_id for update;
  if not found or lower(selected_invite.email)<>current_email then raise exception using errcode='42501',message='Este convite não pertence ao usuário autenticado.'; end if;
  if selected_invite.status='accepted' and selected_invite.auth_user_id=current_user_id then return selected_invite.clinic_id; end if;
  if selected_invite.status in ('cancelled','revoked') then raise exception using errcode='55000',message='Este convite foi cancelado.'; end if;
  if selected_invite.expires_at<=now() then update public.clinic_invites set status='expired' where id=invite_id; raise exception using errcode='55000',message='Este convite expirou.'; end if;
  if selected_invite.status not in ('pending','sent') then raise exception using errcode='55000',message='Este convite não está disponível para aceite.'; end if;
  insert into public.clinic_members(clinic_id,user_id,role,status,created_by) values(selected_invite.clinic_id,current_user_id,selected_invite.role,'invited',selected_invite.created_by)
    on conflict(clinic_id,user_id) do update set role=excluded.role,status=case when clinic_members.status='active' then 'active'::public.clinic_member_status else 'invited'::public.clinic_member_status end;
  update public.clinic_invites set status='accepted',accepted_by=current_user_id,auth_user_id=current_user_id,accepted_at=now(),onboarding_started_at=coalesce(onboarding_started_at,now()) where id=invite_id;
  update public.profiles set full_name=coalesce(nullif(full_name,''),selected_invite.full_name) where id=current_user_id;
  insert into public.clinic_audit_logs(clinic_id,actor_id,target_user_id,event_type,metadata) values(selected_invite.clinic_id,current_user_id,current_user_id,'onboarding_started',jsonb_build_object('invitation_id',invite_id));
  insert into public.clinic_audit_logs(clinic_id,actor_id,target_user_id,event_type,metadata) values(selected_invite.clinic_id,current_user_id,current_user_id,'invitation_accepted',jsonb_build_object('invitation_id',invite_id));
  insert into public.clinic_audit_logs(clinic_id,actor_id,target_user_id,event_type,metadata) values(selected_invite.clinic_id,current_user_id,current_user_id,'password_created',jsonb_build_object('invitation_id',invite_id));
  return selected_invite.clinic_id;
end; $$;

create or replace function public.complete_professional_invite_onboarding(invite_id uuid, profile_data jsonb, terms_version text)
returns text language plpgsql security definer set search_path=public as $$
declare current_user_id uuid:=auth.uid(); selected_invite public.clinic_invites%rowtype; destination text;
begin
  select * into selected_invite from public.clinic_invites where id=invite_id and auth_user_id=current_user_id and status='accepted' for update;
  if not found then raise exception using errcode='42501',message='Onboarding não autorizado.'; end if;
  destination:=case selected_invite.role when 'receptionist' then '/recepcao' when 'secretary' then '/appointments' else '/dashboard' end;
  if selected_invite.onboarding_completed_at is not null then return destination; end if;
  if nullif(trim(terms_version),'') is null then raise exception using errcode='22023',message='Aceite os termos e a política de privacidade.'; end if;
  update public.profiles set full_name=coalesce(nullif(trim(profile_data->>'full_name'),''),full_name),phone=nullif(trim(profile_data->>'phone'),''),active_clinic_id=selected_invite.clinic_id where id=current_user_id;
  insert into public.professional_profiles(clinic_id,user_id,professional_name,profession,council,council_number,council_state,specialty,phone,email,photo_url,signature_url,is_active)
  values(selected_invite.clinic_id,current_user_id,nullif(trim(profile_data->>'full_name'),''),case when selected_invite.role='doctor' then 'Médico' else selected_invite.role::text end,
    nullif(trim(profile_data->>'council'),''),nullif(trim(profile_data->>'council_number'),''),upper(nullif(trim(profile_data->>'council_state'),'')),nullif(trim(profile_data->>'specialty'),''),nullif(trim(profile_data->>'phone'),''),selected_invite.email,nullif(trim(profile_data->>'photo_url'),''),nullif(trim(profile_data->>'signature_url'),''),true)
  on conflict(clinic_id,user_id) do update set professional_name=excluded.professional_name,council=excluded.council,council_number=excluded.council_number,council_state=excluded.council_state,specialty=excluded.specialty,phone=excluded.phone,photo_url=excluded.photo_url,signature_url=excluded.signature_url,is_active=true;
  update public.clinic_members set status='active' where clinic_id=selected_invite.clinic_id and user_id=current_user_id and status='invited';
  update public.clinic_invites set onboarding_completed_at=now(),metadata=metadata||jsonb_build_object('terms_version',terms_version,'terms_accepted_at',now()) where id=invite_id;
  insert into public.clinic_audit_logs(clinic_id,actor_id,target_user_id,event_type,metadata) values(selected_invite.clinic_id,current_user_id,current_user_id,'onboarding_completed',jsonb_build_object('invitation_id',invite_id,'terms_version',terms_version));
  insert into public.clinic_audit_logs(clinic_id,actor_id,target_user_id,event_type,metadata) values(selected_invite.clinic_id,current_user_id,current_user_id,'user_activated',jsonb_build_object('invitation_id',invite_id));
  return destination;
end; $$;

revoke all on function public.create_clinic_invite(text,text,text,jsonb) from public;
revoke all on function public.complete_professional_invite_onboarding(uuid,jsonb,text) from public;
grant execute on function public.create_clinic_invite(text,text,text,jsonb) to authenticated;
grant execute on function public.complete_professional_invite_onboarding(uuid,jsonb,text) to authenticated;
