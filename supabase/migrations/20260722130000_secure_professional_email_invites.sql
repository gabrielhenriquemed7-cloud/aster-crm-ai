-- Evolui o convite existente; não cria um segundo sistema de identidade.
alter table public.clinic_invites
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists delivery_error_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.clinic_invites drop constraint if exists clinic_invites_status_check;
alter table public.clinic_invites add constraint clinic_invites_status_check
  check (status in ('pending', 'sent', 'accepted', 'expired', 'cancelled', 'failed', 'revoked'));

do $$
declare
  existing_index_oid oid := to_regclass('public.clinic_invites_open_email_idx');
  existing_definition text;
  definition_matches boolean;
begin
  if existing_index_oid is null then
    execute $index$
      create unique index clinic_invites_open_email_idx
        on public.clinic_invites using btree (clinic_id, lower(email))
        where status in ('pending', 'sent', 'failed')
    $index$;
    return;
  end if;

  select
    pg_get_indexdef(i.indexrelid),
    i.indrelid = 'public.clinic_invites'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and i.indnkeyatts = 2
      and i.indnatts = 2
      and am.amname = 'btree'
      and i.indkey[0] = (
        select a.attnum
        from pg_attribute a
        where a.attrelid = 'public.clinic_invites'::regclass
          and a.attname = 'clinic_id'
          and not a.attisdropped
      )
      and i.indkey[1] = 0
      and pg_get_indexdef(i.indexrelid, 2, true) = 'lower(email)'
      and opc1.opcname = 'uuid_ops'
      and opc2.opcname = 'text_ops'
      and i.indoption[0] = 0
      and i.indoption[1] = 0
      and i.indcollation[0] = 0
      and i.indcollation[1] = (
        select a.attcollation
        from pg_attribute a
        where a.attrelid = 'public.clinic_invites'::regclass
          and a.attname = 'email'
          and not a.attisdropped
      )
      and pg_get_expr(i.indpred, i.indrelid) = any (array[
        '(status = ANY (ARRAY[''pending''::text, ''sent''::text, ''failed''::text]))',
        '(status = ANY (ARRAY[''pending''::text, ''failed''::text, ''sent''::text]))',
        '(status = ANY (ARRAY[''sent''::text, ''pending''::text, ''failed''::text]))',
        '(status = ANY (ARRAY[''sent''::text, ''failed''::text, ''pending''::text]))',
        '(status = ANY (ARRAY[''failed''::text, ''pending''::text, ''sent''::text]))',
        '(status = ANY (ARRAY[''failed''::text, ''sent''::text, ''pending''::text]))'
      ])
  into existing_definition, definition_matches
  from pg_index i
  join pg_class idx on idx.oid = i.indexrelid
  join pg_am am on am.oid = idx.relam
  join pg_opclass opc1 on opc1.oid = i.indclass[0]
  join pg_opclass opc2 on opc2.oid = i.indclass[1]
  where i.indexrelid = existing_index_oid;

  if not coalesce(definition_matches, false) then
    raise exception using
      errcode = '42P07',
      message = 'O índice public.clinic_invites_open_email_idx já existe com definição divergente.',
      detail = format(
        'Esperado: CREATE UNIQUE INDEX clinic_invites_open_email_idx ON public.clinic_invites USING btree (clinic_id, lower(email)) WHERE status IN (''pending'', ''sent'', ''failed''). Encontrado: %s',
        coalesce(existing_definition, '<objeto não é um índice>')
      ),
      hint = 'Revise o índice manualmente; a migration não remove nem recria índices divergentes.';
  end if;
end;
$$;

create or replace function public.create_clinic_invite(invite_email text, invite_full_name text, invite_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  selected_clinic_id uuid := public.current_clinic_admin_id();
  normalized_email text := lower(trim(invite_email));
  selected_role public.clinic_member_role;
  invite_id uuid;
begin
  if selected_clinic_id is null then raise exception using errcode = '42501', message = 'Sem permissão para convidar usuários nesta clínica.'; end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception using errcode = '22023', message = 'Informe um e-mail válido.'; end if;
  if invite_role not in ('clinic_admin', 'doctor', 'secretary', 'receptionist') then raise exception using errcode = '42501', message = 'Papel inválido para um usuário da clínica.'; end if;
  selected_role := invite_role::public.clinic_member_role;

  if exists (select 1 from public.clinic_members cm join auth.users u on u.id = cm.user_id where cm.clinic_id = selected_clinic_id and lower(u.email) = normalized_email) then
    raise exception using errcode = '23505', message = 'Este profissional já possui acesso à clínica.';
  end if;
  if exists (select 1 from public.clinic_invites where clinic_id = selected_clinic_id and lower(email) = normalized_email and status in ('pending', 'sent', 'failed') and expires_at > now()) then
    raise exception using errcode = '23505', message = 'Já existe um convite pendente para este e-mail.';
  end if;

  update public.clinic_invites set status = 'expired', updated_at = now()
  where clinic_id = selected_clinic_id and lower(email) = normalized_email and status in ('pending', 'sent', 'failed') and expires_at <= now();

  insert into public.clinic_invites (clinic_id, email, full_name, role, created_by)
  values (selected_clinic_id, normalized_email, nullif(trim(coalesce(invite_full_name, '')), ''), selected_role, auth.uid())
  returning id into invite_id;
  insert into public.clinic_audit_logs (clinic_id, actor_id, event_type, metadata)
  values (selected_clinic_id, auth.uid(), 'invite_created', jsonb_build_object('invite_id', invite_id, 'email_domain', split_part(normalized_email, '@', 2), 'role', selected_role));
  return invite_id;
end; $$;

create or replace function public.record_clinic_invite_delivery(invite_id uuid, delivery_succeeded boolean, delivery_code text default null)
returns void language plpgsql security definer set search_path = public as $$
declare selected_clinic_id uuid := public.current_clinic_admin_id(); old_status text; new_status text;
begin
  if selected_clinic_id is null then raise exception using errcode = '42501', message = 'Sem permissão para atualizar convites.'; end if;
  select status into old_status from public.clinic_invites where id = invite_id and clinic_id = selected_clinic_id for update;
  if old_status is null then raise exception using errcode = '42501', message = 'Convite não encontrado nesta clínica.'; end if;
  new_status := case when delivery_succeeded then 'sent' else 'failed' end;
  update public.clinic_invites set status = new_status, last_sent_at = now(), send_count = send_count + 1,
    delivery_error_code = case when delivery_succeeded then null else left(coalesce(delivery_code, 'EMAIL_DELIVERY_FAILED'), 80) end,
    updated_at = now() where id = invite_id;
  insert into public.clinic_audit_logs (clinic_id, actor_id, event_type, metadata)
  values (selected_clinic_id, auth.uid(), case when delivery_succeeded then 'invite_sent' else 'invite_send_failed' end,
    jsonb_build_object('invite_id', invite_id, 'previous_status', old_status, 'new_status', new_status));
end; $$;

begin;

drop function if exists public.renew_active_clinic_invite(uuid);
create function public.renew_active_clinic_invite(invite_id uuid)
returns table(email text, full_name text, clinic_id uuid) language plpgsql security definer set search_path = public as $$
declare selected_clinic_id uuid := public.current_clinic_admin_id(); last_delivery timestamptz;
begin
  if selected_clinic_id is null then raise exception using errcode = '42501', message = 'Sem permissão para reenviar convites desta clínica.'; end if;
  select last_sent_at into last_delivery from public.clinic_invites ci where ci.id = invite_id and ci.clinic_id = selected_clinic_id for update;
  if not found then raise exception using errcode = '42501', message = 'Convite não encontrado nesta clínica.'; end if;
  if last_delivery is not null and last_delivery > now() - interval '60 seconds' then raise exception using errcode = '55000', message = 'Aguarde um minuto antes de reenviar o convite.'; end if;
  return query update public.clinic_invites ci set status = 'pending', token = gen_random_uuid(), expires_at = now() + interval '7 days', updated_at = now()
    where ci.id = invite_id and ci.clinic_id = selected_clinic_id and ci.status in ('pending', 'sent', 'expired', 'failed')
    returning ci.email, ci.full_name, ci.clinic_id;
end; $$;

alter function public.renew_active_clinic_invite(uuid) owner to postgres;
revoke all on function public.renew_active_clinic_invite(uuid) from public;
revoke all on function public.renew_active_clinic_invite(uuid) from anon;
grant execute on function public.renew_active_clinic_invite(uuid) to authenticated;

commit;

drop function if exists public.revoke_active_clinic_invite(uuid);
create or replace function public.revoke_active_clinic_invite(invite_id uuid, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare selected_clinic_id uuid := public.current_clinic_admin_id(); old_status text;
begin
  if selected_clinic_id is null then raise exception using errcode = '42501', message = 'Sem permissão para cancelar convites desta clínica.'; end if;
  update public.clinic_invites set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = nullif(left(trim(coalesce(reason, '')), 500), ''), updated_at = now()
  where id = invite_id and clinic_id = selected_clinic_id and status in ('pending', 'sent', 'expired', 'failed') returning status into old_status;
  if old_status is null then raise exception using errcode = '42501', message = 'Convite não encontrado nesta clínica.'; end if;
  insert into public.clinic_audit_logs (clinic_id, actor_id, event_type, metadata) values (selected_clinic_id, auth.uid(), 'invite_cancelled', jsonb_build_object('invite_id', invite_id));
end; $$;

drop function if exists public.accept_my_clinic_invites();
create or replace function public.accept_my_clinic_invite(invite_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare current_user_id uuid := auth.uid(); current_email text; selected_invite public.clinic_invites%rowtype;
begin
  if current_user_id is null then raise exception using errcode = '28000', message = 'Sua sessão expirou.'; end if;
  select lower(email) into current_email from auth.users where id = current_user_id;
  select * into selected_invite from public.clinic_invites where id = invite_id for update;
  if not found or lower(selected_invite.email) <> current_email then raise exception using errcode = '42501', message = 'Este convite não pertence ao usuário autenticado.'; end if;
  if selected_invite.status in ('cancelled', 'revoked') then raise exception using errcode = '55000', message = 'Este convite foi cancelado.'; end if;
  if selected_invite.expires_at <= now() then update public.clinic_invites set status = 'expired' where id = invite_id; raise exception using errcode = '55000', message = 'Este convite expirou.'; end if;
  if selected_invite.status not in ('pending', 'sent') then raise exception using errcode = '55000', message = 'Este convite não está disponível para aceite.'; end if;
  insert into public.clinic_members (clinic_id, user_id, role, status, created_by) values (selected_invite.clinic_id, current_user_id, selected_invite.role, 'active', selected_invite.created_by)
    on conflict (clinic_id, user_id) do update set role = excluded.role, status = 'active';
  update public.clinic_invites set status = 'accepted', accepted_by = current_user_id, accepted_at = now(), updated_at = now() where id = invite_id;
  update public.profiles set active_clinic_id = selected_invite.clinic_id, full_name = coalesce(nullif(full_name, ''), selected_invite.full_name) where id = current_user_id;
  insert into public.clinic_audit_logs (clinic_id, actor_id, target_user_id, event_type, metadata) values (selected_invite.clinic_id, current_user_id, current_user_id, 'invite_accepted', jsonb_build_object('invite_id', invite_id));
  return selected_invite.clinic_id;
end; $$;

drop function if exists public.list_active_clinic_team();
create function public.list_active_clinic_team()
returns table(record_type text, id uuid, user_id uuid, full_name text, email text, role public.clinic_member_role, status text, created_at timestamptz, expires_at timestamptz, last_sent_at timestamptz, send_count integer, invited_by text)
language plpgsql stable security definer set search_path = public as $$
declare selected_clinic_id uuid := public.current_clinic_admin_id();
begin
  if selected_clinic_id is null then raise exception using errcode = '42501', message = 'Sem permissão para administrar esta clínica.'; end if;
  return query
  select 'member'::text, cm.id, cm.user_id, coalesce(nullif(p.full_name, ''), u.raw_user_meta_data ->> 'full_name'), coalesce(p.email, u.email)::text,
    cm.role, cm.status::text, cm.created_at, null::timestamptz, null::timestamptz, 0, null::text
  from public.clinic_members cm left join public.profiles p on p.id = cm.user_id left join auth.users u on u.id = cm.user_id
  where cm.clinic_id = selected_clinic_id
  union all
  select 'invite'::text, ci.id, null::uuid, ci.full_name, ci.email, ci.role,
    case when ci.status in ('pending', 'sent', 'failed') and ci.expires_at <= now() then 'expired' else ci.status end,
    ci.created_at, ci.expires_at, ci.last_sent_at, ci.send_count, coalesce(inviter.full_name, inviter.email)::text
  from public.clinic_invites ci left join public.profiles inviter on inviter.id = ci.created_by
  where ci.clinic_id = selected_clinic_id and ci.status in ('pending', 'sent', 'failed', 'expired', 'cancelled')
  order by created_at desc;
end; $$;

drop policy if exists "Invitees read own pending invites" on public.clinic_invites;
create policy "Invitees read own invitations" on public.clinic_invites for select to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

revoke all on function public.record_clinic_invite_delivery(uuid, boolean, text) from public;
revoke all on function public.accept_my_clinic_invite(uuid) from public;
grant execute on function public.record_clinic_invite_delivery(uuid, boolean, text) to authenticated;
grant execute on function public.accept_my_clinic_invite(uuid) to authenticated;
grant execute on function public.list_active_clinic_team() to authenticated;
