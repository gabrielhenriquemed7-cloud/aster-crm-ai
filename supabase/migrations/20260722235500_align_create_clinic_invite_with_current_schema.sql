-- Alinha public.create_clinic_invite ao payload atual da aplicação,
-- à estrutura existente de public.clinic_invites e ao fluxo local
-- mais recente de convite e onboarding.
--
-- Não altera tabelas, dados existentes, policies RLS ou outras funções.

create or replace function public.create_clinic_invite(
  invite_email text,
  invite_full_name text,
  invite_role text,
  invite_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  normalized_email text := lower(trim(invite_email));
  selected_role public.clinic_member_role;
  invite_id uuid;
begin
  if selected_clinic_id is null then
    raise exception using
      errcode = '42501',
      message = 'Sem permissão para convidar usuários nesta clínica.';
  end if;

  if normalized_email = ''
    or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using
      errcode = '22023',
      message = 'Informe um e-mail válido.';
  end if;

  if invite_role not in (
    'clinic_admin',
    'doctor',
    'secretary',
    'receptionist'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Papel inválido para um usuário da clínica.';
  end if;

  selected_role := invite_role::public.clinic_member_role;

  if selected_role = 'doctor'
    and (
      nullif(trim(invite_metadata ->> 'council'), '') is null
      or nullif(trim(invite_metadata ->> 'council_number'), '') is null
      or nullif(trim(invite_metadata ->> 'council_state'), '') is null
    ) then
    raise exception using
      errcode = '22023',
      message = 'Informe conselho, número e UF para o médico.';
  end if;

  if exists (
    select 1
    from public.clinic_members as cm
    join auth.users as u
      on u.id = cm.user_id
    where cm.clinic_id = selected_clinic_id
      and lower(u.email) = normalized_email
      and cm.status = 'active'
  ) then
    raise exception using
      errcode = '23505',
      message = 'Este profissional já possui acesso à clínica.';
  end if;

  if exists (
    select 1
    from public.clinic_invites as ci
    where ci.clinic_id = selected_clinic_id
      and lower(ci.email) = normalized_email
      and ci.status in ('pending', 'sent', 'failed')
      and ci.expires_at > now()
  ) then
    raise exception using
      errcode = '23505',
      message = 'Já existe um convite pendente para este e-mail.';
  end if;

  update public.clinic_invites as ci
  set
    status = 'expired',
    updated_at = now()
  where ci.clinic_id = selected_clinic_id
    and lower(ci.email) = normalized_email
    and ci.status in ('pending', 'sent', 'failed')
    and ci.expires_at <= now();

  insert into public.clinic_invites (
    clinic_id,
    email,
    full_name,
    role,
    created_by,
    metadata
  )
  values (
    selected_clinic_id,
    normalized_email,
    nullif(trim(invite_full_name), ''),
    selected_role,
    auth.uid(),
    jsonb_strip_nulls(
      jsonb_build_object(
        'specialty',
        nullif(trim(invite_metadata ->> 'specialty'), ''),
        'council',
        nullif(trim(invite_metadata ->> 'council'), ''),
        'council_number',
        nullif(trim(invite_metadata ->> 'council_number'), ''),
        'council_state',
        upper(nullif(trim(invite_metadata ->> 'council_state'), '')),
        'phone',
        nullif(trim(invite_metadata ->> 'phone'), '')
      )
    )
  )
  returning id into invite_id;

  insert into public.clinic_audit_logs (
    clinic_id,
    actor_id,
    event_type,
    metadata
  )
  values (
    selected_clinic_id,
    auth.uid(),
    'professional_invited',
    jsonb_build_object(
      'invitation_id', invite_id,
      'role', selected_role,
      'email_domain', split_part(normalized_email, '@', 2)
    )
  );

  return invite_id;
end;
$function$;

revoke all
on function public.create_clinic_invite(text, text, text, jsonb)
from public;

revoke all
on function public.create_clinic_invite(text, text, text, jsonb)
from anon;

grant execute
on function public.create_clinic_invite(text, text, text, jsonb)
to authenticated;

notify pgrst, 'reload schema';
