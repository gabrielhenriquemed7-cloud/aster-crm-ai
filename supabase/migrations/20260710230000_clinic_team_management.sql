create table if not exists public.clinic_invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email text not null,
  full_name text,
  role public.clinic_member_role not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token uuid not null default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_invites_assignable_role check (role <> 'platform_admin')
);

create unique index if not exists clinic_invites_token_idx on public.clinic_invites(token);
create unique index if not exists clinic_invites_pending_email_idx
  on public.clinic_invites(clinic_id, lower(email)) where status = 'pending';
create index if not exists clinic_invites_clinic_status_idx
  on public.clinic_invites(clinic_id, status, created_at desc);

create or replace function public.current_clinic_admin_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.clinic_id
  from public.profiles p
  join public.clinic_members cm
    on cm.clinic_id = p.active_clinic_id
   and cm.user_id = p.id
   and cm.status = 'active'
   and cm.role = 'clinic_admin'
  where p.id = auth.uid();
$$;

revoke all on function public.current_clinic_admin_id() from public;
grant execute on function public.current_clinic_admin_id() to authenticated;

create or replace function public.protect_clinic_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_admins integer;
  removes_active_admin boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.clinic_id is distinct from old.clinic_id or new.user_id is distinct from old.user_id then
      raise exception using errcode = '42501', message = 'Clínica e usuário do vínculo não podem ser alterados.';
    end if;

    if new.role = 'platform_admin' and old.role <> 'platform_admin' then
      raise exception using errcode = '42501', message = 'Administrador da clínica não pode atribuir platform_admin.';
    end if;

    removes_active_admin := old.role = 'clinic_admin' and old.status = 'active'
      and (new.role <> 'clinic_admin' or new.status <> 'active');
  elsif tg_op = 'DELETE' then
    removes_active_admin := old.role = 'clinic_admin' and old.status = 'active';
  end if;

  if removes_active_admin then
    select count(*) into remaining_admins
    from public.clinic_members cm
    where cm.clinic_id = old.clinic_id
      and cm.role = 'clinic_admin'
      and cm.status = 'active'
      and cm.id <> old.id;

    if remaining_admins = 0 then
      raise exception using errcode = '23514', message = 'A clínica precisa manter pelo menos um administrador ativo.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_clinic_membership_trigger on public.clinic_members;
create trigger protect_clinic_membership_trigger
before update or delete on public.clinic_members
for each row execute function public.protect_clinic_membership();

drop trigger if exists clinic_invites_set_updated_at on public.clinic_invites;
create trigger clinic_invites_set_updated_at
before update on public.clinic_invites
for each row execute function public.set_updated_at();

create or replace function public.list_active_clinic_team()
returns table (
  record_type text,
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  role public.clinic_member_role,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para administrar esta clínica.';
  end if;

  return query
  select
    'member'::text,
    cm.id,
    cm.user_id,
    coalesce(nullif(p.full_name, ''), u.raw_user_meta_data ->> 'full_name'),
    coalesce(p.email, u.email)::text,
    cm.role,
    cm.status::text,
    cm.created_at,
    null::timestamptz
  from public.clinic_members cm
  left join public.profiles p on p.id = cm.user_id
  left join auth.users u on u.id = cm.user_id
  where cm.clinic_id = selected_clinic_id

  union all

  select
    'invite'::text,
    ci.id,
    null::uuid,
    ci.full_name,
    ci.email,
    ci.role,
    case when ci.status = 'pending' and ci.expires_at <= now() then 'expired' else ci.status end,
    ci.created_at,
    ci.expires_at
  from public.clinic_invites ci
  where ci.clinic_id = selected_clinic_id
    and ci.status = 'pending'
    and not exists (
      select 1 from public.clinic_members cm
      join auth.users u on u.id = cm.user_id
      where cm.clinic_id = selected_clinic_id and lower(u.email) = lower(ci.email)
    )
  order by created_at;
end;
$$;

create or replace function public.create_clinic_invite(
  invite_email text,
  invite_full_name text,
  invite_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  normalized_email text := lower(trim(invite_email));
  selected_role public.clinic_member_role;
  invite_id uuid;
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para convidar usuários nesta clínica.';
  end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = '22023', message = 'Informe um e-mail válido.';
  end if;
  if invite_role not in ('clinic_admin', 'doctor', 'secretary', 'receptionist') then
    raise exception using errcode = '42501', message = 'Papel inválido para um usuário da clínica.';
  end if;
  selected_role := invite_role::public.clinic_member_role;

  if exists (
    select 1 from public.clinic_members cm
    join auth.users u on u.id = cm.user_id
    where cm.clinic_id = selected_clinic_id and lower(u.email) = normalized_email
  ) then
    raise exception using errcode = '23505', message = 'Este usuário já está vinculado à clínica.';
  end if;

  update public.clinic_invites
  set status = 'expired'
  where clinic_id = selected_clinic_id and lower(email) = normalized_email
    and status = 'pending' and expires_at <= now();

  insert into public.clinic_invites (clinic_id, email, full_name, role, created_by)
  values (
    selected_clinic_id,
    normalized_email,
    nullif(trim(coalesce(invite_full_name, '')), ''),
    selected_role,
    auth.uid()
  )
  on conflict (clinic_id, (lower(email))) where status = 'pending'
  do update set
    full_name = excluded.full_name,
    role = excluded.role,
    created_by = auth.uid(),
    token = gen_random_uuid(),
    expires_at = now() + interval '7 days',
    updated_at = now()
  returning id into invite_id;

  insert into public.clinic_audit_logs (clinic_id, actor_id, event_type, metadata)
  values (selected_clinic_id, auth.uid(), 'member_invited', jsonb_build_object('email', normalized_email, 'role', selected_role));

  return invite_id;
end;
$$;

create or replace function public.accept_my_clinic_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  accepted_count integer := 0;
  selected_invite public.clinic_invites%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Você precisa estar autenticado para aceitar o convite.';
  end if;

  select lower(email) into current_email from auth.users where id = current_user_id;

  for selected_invite in
    select * from public.clinic_invites
    where lower(email) = current_email and status = 'pending' and expires_at > now()
    order by created_at
    for update
  loop
    insert into public.clinic_members (clinic_id, user_id, role, status, created_by)
    values (selected_invite.clinic_id, current_user_id, selected_invite.role, 'active', selected_invite.created_by)
    on conflict (clinic_id, user_id) do update
      set role = excluded.role, status = 'active', created_by = excluded.created_by;

    update public.clinic_invites
    set status = 'accepted', accepted_by = current_user_id, accepted_at = now()
    where id = selected_invite.id;

    update public.profiles
    set active_clinic_id = coalesce(active_clinic_id, selected_invite.clinic_id),
        full_name = coalesce(nullif(full_name, ''), selected_invite.full_name)
    where id = current_user_id;

    insert into public.clinic_audit_logs (clinic_id, actor_id, target_user_id, event_type, metadata)
    values (selected_invite.clinic_id, current_user_id, current_user_id, 'invite_accepted', jsonb_build_object('invite_id', selected_invite.id));

    accepted_count := accepted_count + 1;
  end loop;

  update public.clinic_invites set status = 'expired'
  where lower(email) = current_email and status = 'pending' and expires_at <= now();

  return accepted_count;
end;
$$;

create or replace function public.update_active_clinic_member(
  member_id uuid,
  member_role text default null,
  member_status text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  target public.clinic_members%rowtype;
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para alterar usuários nesta clínica.';
  end if;
  select * into target from public.clinic_members where id = member_id and clinic_id = selected_clinic_id for update;
  if not found or target.role = 'platform_admin' then
    raise exception using errcode = '42501', message = 'Vínculo não encontrado nesta clínica.';
  end if;
  if member_role is not null and member_role not in ('clinic_admin', 'doctor', 'secretary', 'receptionist') then
    raise exception using errcode = '42501', message = 'Papel inválido para um usuário da clínica.';
  end if;
  if member_status is not null and member_status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'Status inválido para o vínculo.';
  end if;

  update public.clinic_members
  set role = coalesce(member_role::public.clinic_member_role, role),
      status = coalesce(member_status::public.clinic_member_status, status)
  where id = member_id;

  insert into public.clinic_audit_logs (clinic_id, actor_id, target_user_id, event_type, metadata)
  values (selected_clinic_id, auth.uid(), target.user_id, 'member_updated',
    jsonb_strip_nulls(jsonb_build_object('role', member_role, 'status', member_status)));
end;
$$;

create or replace function public.remove_active_clinic_member(member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  target public.clinic_members%rowtype;
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para remover usuários desta clínica.';
  end if;
  select * into target from public.clinic_members where id = member_id and clinic_id = selected_clinic_id for update;
  if not found or target.role = 'platform_admin' then
    raise exception using errcode = '42501', message = 'Vínculo não encontrado nesta clínica.';
  end if;

  delete from public.clinic_members where id = member_id;
  update public.profiles set active_clinic_id = null
  where id = target.user_id and active_clinic_id = selected_clinic_id;

  insert into public.clinic_audit_logs (clinic_id, actor_id, target_user_id, event_type)
  values (selected_clinic_id, auth.uid(), target.user_id, 'member_removed');
end;
$$;

create or replace function public.renew_active_clinic_invite(invite_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  invite_email text;
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para reenviar convites desta clínica.';
  end if;
  update public.clinic_invites
  set status = 'pending', token = gen_random_uuid(), expires_at = now() + interval '7 days'
  where id = invite_id and clinic_id = selected_clinic_id and status in ('pending', 'expired')
  returning email into invite_email;
  if invite_email is null then
    raise exception using errcode = '42501', message = 'Convite não encontrado nesta clínica.';
  end if;
  return invite_email;
end;
$$;

create or replace function public.revoke_active_clinic_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
begin
  if selected_clinic_id is null then
    raise exception using errcode = '42501', message = 'Sem permissão para cancelar convites desta clínica.';
  end if;
  update public.clinic_invites set status = 'revoked'
  where id = invite_id and clinic_id = selected_clinic_id and status in ('pending', 'expired');
  if not found then
    raise exception using errcode = '42501', message = 'Convite não encontrado nesta clínica.';
  end if;
end;
$$;

alter table public.clinic_invites enable row level security;

drop policy if exists "Read own or active clinic members" on public.clinic_members;
drop policy if exists "Clinic admins manage members" on public.clinic_members;
drop policy if exists "Members read own membership" on public.clinic_members;
drop policy if exists "Clinic admins read active clinic members" on public.clinic_members;
create policy "Members read own membership" on public.clinic_members
  for select to authenticated using (user_id = auth.uid());
create policy "Clinic admins read active clinic members" on public.clinic_members
  for select to authenticated using (clinic_id = public.current_clinic_admin_id());

drop policy if exists "Clinic admins read active clinic invites" on public.clinic_invites;
drop policy if exists "Invitees read own pending invites" on public.clinic_invites;
create policy "Clinic admins read active clinic invites" on public.clinic_invites
  for select to authenticated using (clinic_id = public.current_clinic_admin_id());
create policy "Invitees read own pending invites" on public.clinic_invites
  for select to authenticated using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and status = 'pending' and expires_at > now()
  );

revoke insert, update, delete on public.clinic_members from authenticated;
revoke insert, update, delete on public.clinic_invites from authenticated;
grant select on public.clinic_members, public.clinic_invites to authenticated;

revoke all on function public.list_active_clinic_team() from public;
revoke all on function public.create_clinic_invite(text, text, text) from public;
revoke all on function public.accept_my_clinic_invites() from public;
revoke all on function public.update_active_clinic_member(uuid, text, text) from public;
revoke all on function public.remove_active_clinic_member(uuid) from public;
revoke all on function public.renew_active_clinic_invite(uuid) from public;
revoke all on function public.revoke_active_clinic_invite(uuid) from public;

grant execute on function public.list_active_clinic_team() to authenticated;
grant execute on function public.create_clinic_invite(text, text, text) to authenticated;
grant execute on function public.accept_my_clinic_invites() to authenticated;
grant execute on function public.update_active_clinic_member(uuid, text, text) to authenticated;
grant execute on function public.remove_active_clinic_member(uuid) to authenticated;
grant execute on function public.renew_active_clinic_invite(uuid) to authenticated;
grant execute on function public.revoke_active_clinic_invite(uuid) to authenticated;
