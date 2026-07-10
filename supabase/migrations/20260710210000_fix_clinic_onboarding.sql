create or replace function public.create_clinic_with_owner(
  clinic_name text,
  clinic_legal_name text default null,
  clinic_cnpj text default null,
  clinic_email text default null,
  clinic_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_clinic_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Você precisa estar autenticado para criar uma clínica.';
  end if;

  if coalesce(trim(clinic_name), '') = '' or char_length(trim(clinic_name)) < 3 then
    raise exception using errcode = '22023', message = 'Informe um nome de clínica com pelo menos 3 caracteres.';
  end if;

  if exists (
    select 1 from public.clinic_members
    where user_id = current_user_id
  ) and not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Usuários já vinculados a uma clínica não podem criar outra clínica.';
  end if;

  insert into public.profiles (id, full_name, email)
  select id, coalesce(raw_user_meta_data ->> 'full_name', ''), email
  from auth.users where id = current_user_id
  on conflict (id) do update set email = coalesce(public.profiles.email, excluded.email);

  insert into public.clinics (name, legal_name, cnpj, email, phone, status, plan)
  values (
    trim(clinic_name),
    nullif(trim(coalesce(clinic_legal_name, '')), ''),
    nullif(regexp_replace(coalesce(clinic_cnpj, ''), '\D', '', 'g'), ''),
    nullif(lower(trim(coalesce(clinic_email, ''))), ''),
    nullif(trim(coalesce(clinic_phone, '')), ''),
    'active',
    'starter'
  )
  returning id into new_clinic_id;

  insert into public.clinic_members (clinic_id, user_id, role, status, created_by)
  values (new_clinic_id, current_user_id, 'clinic_admin', 'active', current_user_id);

  update public.profiles
  set active_clinic_id = new_clinic_id
  where id = current_user_id;

  insert into public.clinic_audit_logs (clinic_id, actor_id, target_user_id, event_type, metadata)
  values (new_clinic_id, current_user_id, current_user_id, 'clinic_created', jsonb_build_object('source', 'onboarding'));

  return new_clinic_id;
end;
$$;

revoke all on function public.create_clinic_with_owner(text, text, text, text, text) from public;
grant execute on function public.create_clinic_with_owner(text, text, text, text, text) to authenticated;
