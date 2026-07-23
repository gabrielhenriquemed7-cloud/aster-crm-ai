


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."appointment_status_v1" AS ENUM (
    'scheduled',
    'confirmed',
    'waiting',
    'in_progress',
    'completed',
    'cancelled',
    'no_show'
);


ALTER TYPE "public"."appointment_status_v1" OWNER TO "postgres";


CREATE TYPE "public"."appointment_type_v1" AS ENUM (
    'consultation',
    'return',
    'procedure',
    'teleconsultation',
    'exam',
    'other'
);


ALTER TYPE "public"."appointment_type_v1" OWNER TO "postgres";


CREATE TYPE "public"."clinic_member_role" AS ENUM (
    'platform_admin',
    'clinic_admin',
    'doctor',
    'secretary',
    'receptionist'
);


ALTER TYPE "public"."clinic_member_role" OWNER TO "postgres";


CREATE TYPE "public"."clinic_member_status" AS ENUM (
    'active',
    'inactive',
    'invited'
);


ALTER TYPE "public"."clinic_member_status" OWNER TO "postgres";


CREATE TYPE "public"."clinic_plan" AS ENUM (
    'starter',
    'professional',
    'enterprise'
);


ALTER TYPE "public"."clinic_plan" OWNER TO "postgres";


CREATE TYPE "public"."clinic_status" AS ENUM (
    'active',
    'inactive',
    'suspended'
);


ALTER TYPE "public"."clinic_status" OWNER TO "postgres";


CREATE TYPE "public"."clinical_document_status" AS ENUM (
    'draft',
    'in_review',
    'finalized',
    'signed',
    'archived',
    'cancelled'
);


ALTER TYPE "public"."clinical_document_status" OWNER TO "postgres";


CREATE TYPE "public"."clinical_document_type" AS ENUM (
    'prescription',
    'special_prescription',
    'medical_certificate',
    'attendance_declaration',
    'exam_request',
    'referral',
    'patient_guidance',
    'medical_report',
    'clinical_summary',
    'printable_evolution'
);


ALTER TYPE "public"."clinical_document_type" OWNER TO "postgres";


CREATE TYPE "public"."medical_record_status" AS ENUM (
    'draft',
    'finalized',
    'amended'
);


ALTER TYPE "public"."medical_record_status" OWNER TO "postgres";


CREATE TYPE "public"."medication_clinical_status" AS ENUM (
    'draft',
    'in_review',
    'reviewed',
    'approved',
    'suspended',
    'outdated'
);


ALTER TYPE "public"."medication_clinical_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'administrator',
    'doctor',
    'secretary',
    'receptionist'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_my_clinic_invite"("invite_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  invite_record public.clinic_invites%ROWTYPE;
  authenticated_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.';
  END IF;

  authenticated_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  SELECT *
  INTO invite_record
  FROM public.clinic_invites
  WHERE id = invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite nao encontrado.';
  END IF;

  IF invite_record.status = 'accepted'
    AND invite_record.auth_user_id = auth.uid() THEN
    RETURN invite_record.clinic_id;
  END IF;

  IF lower(invite_record.email) <> authenticated_email
    OR invite_record.status NOT IN ('pending', 'sent')
    OR invite_record.expires_at <= now() THEN
    RAISE EXCEPTION 'Convite invalido ou expirado.';
  END IF;

  INSERT INTO public.clinic_members (
    clinic_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at
  )
  VALUES (
    invite_record.clinic_id,
    auth.uid(),
    invite_record.role,
    'invited',
    invite_record.invited_by,
    NULL
  )
  ON CONFLICT (clinic_id, user_id) DO UPDATE
  SET role = excluded.role,
      status = CASE
        WHEN public.clinic_members.status = 'active' THEN public.clinic_members.status
        ELSE 'invited'
      END,
      invited_by = excluded.invited_by;

  UPDATE public.profiles
  SET full_name = coalesce(nullif(trim(full_name), ''), invite_record.full_name)
  WHERE user_id = auth.uid();

  UPDATE public.clinic_invites
  SET status = 'accepted',
      accepted_at = now(),
      auth_user_id = auth.uid(),
      onboarding_started_at = coalesce(onboarding_started_at, now())
  WHERE id = invite_record.id;

  INSERT INTO public.clinic_audit_logs (
    clinic_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES
    (
      invite_record.clinic_id,
      auth.uid(),
      'professional_onboarding_started',
      'clinic_invite',
      invite_record.id,
      jsonb_build_object('role', invite_record.role, 'email', invite_record.email)
    ),
    (
      invite_record.clinic_id,
      auth.uid(),
      'invitation_accepted',
      'clinic_invite',
      invite_record.id,
      jsonb_build_object('role', invite_record.role)
    ),
    (
      invite_record.clinic_id,
      auth.uid(),
      'password_created',
      'clinic_invite',
      invite_record.id,
      '{}'::jsonb
    );

  RETURN invite_record.clinic_id;
END;
$$;


ALTER FUNCTION "public"."accept_my_clinic_invite"("invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_my_clinic_invites"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."accept_my_clinic_invites"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."active_clinic_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.active_clinic_id from public.profiles p join public.clinic_members cm on cm.clinic_id = p.active_clinic_id and cm.user_id = p.id and cm.status = 'active' where p.id = auth.uid();
$$;


ALTER FUNCTION "public"."active_clinic_id"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "professional_id" "uuid",
    "title" "text",
    "appointment_date" "date",
    "start_time" time without time zone,
    "end_time" time without time zone,
    "appointment_type" "public"."appointment_type_v1" DEFAULT 'consultation'::"public"."appointment_type_v1" NOT NULL,
    "status" "public"."appointment_status_v1" DEFAULT 'scheduled'::"public"."appointment_status_v1" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "arrived_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "completed_by" "uuid",
    "check_in_at" timestamp with time zone,
    "checked_in_by" "uuid",
    "waiting_since" timestamp with time zone,
    "called_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "arrival_notes" "text",
    "attendance_started_at" timestamp with time zone,
    "attendance_started_by" "uuid",
    "consultation_started_at" timestamp with time zone,
    "consultation_last_activity" timestamp with time zone,
    "consultation_locked_by" "uuid",
    "consultation_lock_until" timestamp with time zone,
    "consultation_lock_token" "uuid",
    "consultation_duration_seconds" integer,
    "finalized_version" bigint,
    "finalization_summary" "jsonb",
    "finalization_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reopened_at" timestamp with time zone,
    "reopened_by" "uuid",
    "reopening_reason" "text",
    "has_addendum" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_reception_appointment"("target_appointment_id" "uuid", "target_status" "public"."appointment_status_v1", "reception_notes" "text" DEFAULT NULL::"text") RETURNS "public"."appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."advance_reception_appointment"("target_appointment_id" "uuid", "target_status" "public"."appointment_status_v1", "reception_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_care_continuity_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."audit_care_continuity_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_clinical_document_center_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, metadata)
    values(new.clinic_id, new.id, auth.uid(), 'created', jsonb_build_object('version', new.document_version));
  elsif new.status = 'draft' and (new.title is distinct from old.title or new.content is distinct from old.content) then
    insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, metadata)
    values(new.clinic_id, new.id, auth.uid(), 'edited', jsonb_build_object('version', new.document_version, 'generated_by_ai', new.generated_by_ai));
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."audit_clinical_document_center_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."autosave_consultation_draft"("target_appointment_id" "uuid", "lock_token" "uuid", "draft" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."autosave_consultation_draft"("target_appointment_id" "uuid", "lock_token" "uuid", "draft" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_medical_record_clinic"("target_clinic_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles profile
    join public.clinic_members member
      on member.clinic_id = profile.active_clinic_id
     and member.user_id = profile.id
     and member.status = 'active'
    where profile.id = auth.uid()
      and profile.active_clinic_id = target_clinic_id
  );
$$;


ALTER FUNCTION "public"."can_access_medical_record_clinic"("target_clinic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_patient_clinic"("target_clinic_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles profile
    join public.clinic_members member
      on member.clinic_id = profile.active_clinic_id
     and member.user_id = profile.id
     and member.status = 'active'
    where profile.id = auth.uid()
      and profile.active_clinic_id = target_clinic_id
  );
$$;


ALTER FUNCTION "public"."can_access_patient_clinic"("target_clinic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_clinical_document"("target_document_id" "uuid", "reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  doc public.clinical_documents%rowtype;
begin
  select * into doc from public.clinical_documents
  where id = target_document_id and clinic_id = public.active_clinic_id() and deleted_at is null
  for update;
  if doc.id is null or doc.professional_id <> auth.uid() then raise exception using errcode = '42501', message = 'Documento não encontrado na clínica ativa.'; end if;
  if doc.status = 'cancelled' then return doc.id; end if;
  if doc.status not in ('finalized', 'signed') or nullif(trim(reason), '') is null then
    raise exception using errcode = '23514', message = 'Informe o motivo para cancelar um documento finalizado.';
  end if;
  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents set status = 'cancelled', cancelled_at = now(),
    cancelled_by = auth.uid(), cancellation_reason = trim(reason) where id = doc.id;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, metadata)
  values (doc.clinic_id, doc.id, auth.uid(), 'cancelled', jsonb_build_object('reason', trim(reason)));
  return doc.id;
end
$$;


ALTER FUNCTION "public"."cancel_clinical_document"("target_document_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canonical_jsonb_sha256"("value" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select encode(extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex')
$$;


ALTER FUNCTION "public"."canonical_jsonb_sha256"("value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_clinical_document_physician_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  reviewing_user_id uuid := auth.uid();
begin
  if new.status in ('finalized', 'signed', 'archived')
    and not new.reviewed_by_physician
    and old.status not in ('finalized', 'signed', 'archived') then
    if reviewing_user_id is null then
      raise exception using errcode = '28000', message = 'Sessão expirada.';
    end if;

    if new.professional_id is distinct from reviewing_user_id then
      raise exception using errcode = '42501', message = 'Somente o profissional responsável pode revisar o documento.';
    end if;

    if not exists (
      select 1
      from public.profiles profile
      join public.clinic_members member
        on member.clinic_id = new.clinic_id
       and member.user_id = reviewing_user_id
       and member.status = 'active'
       and member.role in ('doctor', 'clinic_admin')
      where profile.id = reviewing_user_id
        and profile.active_clinic_id = new.clinic_id
    ) then
      raise exception using errcode = '42501', message = 'Profissional sem permissão para revisar documentos nesta clínica.';
    end if;

    new.reviewed_by_physician := true;
    new.reviewed_by := reviewing_user_id;
    new.reviewed_at := now();
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."capture_clinical_document_physician_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinic_asset_clinic_id"("object_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $_$
begin
  if object_name !~ '^clinics/[0-9a-fA-F-]{36}/logo/[^/]+$' then return null; end if;
  return (storage.foldername(object_name))[2]::uuid;
exception when invalid_text_representation then return null;
end;
$_$;


ALTER FUNCTION "public"."clinic_asset_clinic_id"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_document_asset_clinic_id"("object_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $_$
begin
  if object_name !~ '^clinics/[0-9a-fA-F-]{36}/documents/[0-9a-fA-F-]{36}/[^/]+\.pdf$' then return null; end if;
  return (storage.foldername(object_name))[2]::uuid;
exception when invalid_text_representation then return null;
end
$_$;


ALTER FUNCTION "public"."clinical_document_asset_clinic_id"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_document_asset_document_id"("object_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $_$
begin
  if object_name !~ '^clinics/[0-9a-fA-F-]{36}/documents/[0-9a-fA-F-]{36}/[^/]+\.pdf$' then return null; end if;
  return (storage.foldername(object_name))[4]::uuid;
exception when invalid_text_representation then return null;
end
$_$;


ALTER FUNCTION "public"."clinical_document_asset_document_id"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_professional_invite_onboarding"("invite_id" "uuid", "profile_data" "jsonb", "terms_version" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  invite_record public.clinic_invites%ROWTYPE;
  destination text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.';
  END IF;

  IF nullif(trim(terms_version), '') IS NULL THEN
    RAISE EXCEPTION 'Versao dos termos obrigatoria.';
  END IF;

  SELECT *
  INTO invite_record
  FROM public.clinic_invites
  WHERE id = invite_id
    AND auth_user_id = auth.uid()
    AND status = 'accepted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite aceito nao encontrado.';
  END IF;

  destination := CASE invite_record.role
    WHEN 'doctor' THEN '/doctor'
    WHEN 'receptionist' THEN '/receptionist'
    ELSE '/clinic/dashboard'
  END;

  IF invite_record.onboarding_completed_at IS NOT NULL THEN
    RETURN destination;
  END IF;

  UPDATE public.profiles
  SET full_name = coalesce(
        nullif(trim(profile_data ->> 'full_name'), ''),
        nullif(trim(full_name), ''),
        invite_record.full_name
      ),
      phone = coalesce(nullif(trim(profile_data ->> 'phone'), ''), phone),
      active_clinic_id = invite_record.clinic_id
  WHERE user_id = auth.uid();

  INSERT INTO public.professional_profiles (
    clinic_id,
    user_id,
    role,
    specialty,
    council_type,
    council_number,
    council_state,
    professional_phone,
    professional_email,
    professional_bio,
    avatar_url,
    signature_url,
    signature_requested_at,
    terms_accepted_at,
    terms_version,
    onboarding_completed_at
  )
  VALUES (
    invite_record.clinic_id,
    auth.uid(),
    invite_record.role,
    coalesce(
      nullif(trim(profile_data ->> 'specialty'), ''),
      nullif(trim(invite_record.metadata ->> 'specialty'), '')
    ),
    coalesce(
      nullif(trim(profile_data ->> 'council_type'), ''),
      nullif(trim(invite_record.metadata ->> 'council_type'), '')
    ),
    coalesce(
      nullif(trim(profile_data ->> 'council_number'), ''),
      nullif(trim(invite_record.metadata ->> 'council_number'), '')
    ),
    coalesce(
      nullif(trim(profile_data ->> 'council_state'), ''),
      nullif(trim(invite_record.metadata ->> 'council_state'), '')
    ),
    nullif(trim(profile_data ->> 'professional_phone'), ''),
    nullif(trim(profile_data ->> 'professional_email'), ''),
    nullif(trim(profile_data ->> 'professional_bio'), ''),
    nullif(trim(profile_data ->> 'avatar_url'), ''),
    nullif(trim(profile_data ->> 'signature_url'), ''),
    CASE
      WHEN nullif(trim(profile_data ->> 'signature_url'), '') IS NULL THEN NULL
      ELSE now()
    END,
    now(),
    trim(terms_version),
    now()
  )
  ON CONFLICT (clinic_id, user_id) DO UPDATE
  SET role = excluded.role,
      specialty = excluded.specialty,
      council_type = excluded.council_type,
      council_number = excluded.council_number,
      council_state = excluded.council_state,
      professional_phone = excluded.professional_phone,
      professional_email = excluded.professional_email,
      professional_bio = excluded.professional_bio,
      avatar_url = excluded.avatar_url,
      signature_url = excluded.signature_url,
      signature_requested_at = excluded.signature_requested_at,
      terms_accepted_at = excluded.terms_accepted_at,
      terms_version = excluded.terms_version,
      onboarding_completed_at = excluded.onboarding_completed_at,
      updated_at = now();

  UPDATE public.clinic_members
  SET status = 'active',
      joined_at = coalesce(joined_at, now())
  WHERE clinic_id = invite_record.clinic_id
    AND user_id = auth.uid()
    AND status = 'invited';

  UPDATE public.clinic_invites
  SET onboarding_completed_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'terms_version',
          trim(terms_version),
          'terms_accepted_at',
          now()
        )
  WHERE id = invite_record.id;

  INSERT INTO public.clinic_audit_logs (
    clinic_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES
    (
      invite_record.clinic_id,
      auth.uid(),
      'professional_onboarding_completed',
      'clinic_invite',
      invite_record.id,
      jsonb_build_object('role', invite_record.role, 'terms_version', trim(terms_version))
    ),
    (
      invite_record.clinic_id,
      auth.uid(),
      'professional_membership_activated',
      'clinic_member',
      (
        SELECT id
        FROM public.clinic_members
        WHERE clinic_id = invite_record.clinic_id
          AND user_id = auth.uid()
      ),
      jsonb_build_object('role', invite_record.role)
    );

  RETURN destination;
END;
$$;


ALTER FUNCTION "public"."complete_professional_invite_onboarding"("invite_id" "uuid", "profile_data" "jsonb", "terms_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_clinic_for_current_user"("clinic_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare new_clinic_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  insert into public.clinics(name, legal_name) values (trim(clinic_name), trim(clinic_name)) returning id into new_clinic_id;
  insert into public.clinic_members(clinic_id, user_id, role, status, created_by) values (new_clinic_id, auth.uid(), 'clinic_admin', 'active', auth.uid());
  update public.profiles set active_clinic_id = new_clinic_id where id = auth.uid();
  insert into public.clinic_audit_logs(clinic_id, actor_id, target_user_id, event_type) values (new_clinic_id, auth.uid(), auth.uid(), 'clinic_created');
  return new_clinic_id;
end; $$;


ALTER FUNCTION "public"."create_clinic_for_current_user"("clinic_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_clinic_invite"("invite_email" "text", "invite_full_name" "text", "invite_role" "text", "invite_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."create_clinic_invite"("invite_email" "text", "invite_full_name" "text", "invite_role" "text", "invite_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_clinic_with_owner"("clinic_name" "text", "clinic_legal_name" "text" DEFAULT NULL::"text", "clinic_cnpj" "text" DEFAULT NULL::"text", "clinic_email" "text" DEFAULT NULL::"text", "clinic_phone" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    where user_id = current_user_id and status = 'active'
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


ALTER FUNCTION "public"."create_clinic_with_owner"("clinic_name" "text", "clinic_legal_name" "text", "clinic_cnpj" "text", "clinic_email" "text", "clinic_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_encounter_continuity_items"("target_appointment_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_encounter_continuity_items"("target_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_medical_record_addendum"("target_record_id" "uuid", "addendum_content" "text", "addendum_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_medical_record_addendum"("target_record_id" "uuid", "addendum_content" "text", "addendum_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_clinic_admin_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select cm.clinic_id
  from public.profiles p
  join public.clinic_members cm
    on cm.clinic_id = p.active_clinic_id
   and cm.user_id = p.id
   and cm.status = 'active'
   and cm.role = 'clinic_admin'
  where p.id = auth.uid();
$$;


ALTER FUNCTION "public"."current_clinic_admin_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_appointment_tenant_and_conflict"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  current_clinic_id uuid;
begin
  select profile.active_clinic_id into current_clinic_id
  from public.profiles profile
  join public.clinic_members member
    on member.clinic_id = profile.active_clinic_id
   and member.user_id = profile.id
   and member.status = 'active'
  where profile.id = current_user_id;

  if current_user_id is null or current_clinic_id is null then
    raise exception using errcode = '42501', message = 'Selecione uma clínica com vínculo ativo.';
  end if;

  if tg_op = 'INSERT' then
    new.clinic_id := current_clinic_id;
    new.created_by := current_user_id;
  elsif new.clinic_id is distinct from old.clinic_id or new.created_by is distinct from old.created_by then
    raise exception using errcode = '42501', message = 'Clínica e autoria da consulta não podem ser alteradas.';
  end if;

  if new.clinic_id <> current_clinic_id then
    raise exception using errcode = '42501', message = 'A consulta deve pertencer à clínica ativa.';
  end if;

  if not exists (
    select 1
    from public.patients
    where id = new.patient_id
      and clinic_id = current_clinic_id
      and deleted_at is null
  ) then
    raise exception using errcode = '42501', message = 'Paciente não pertence à clínica ativa.';
  end if;

  if not exists (
    select 1
    from public.clinic_members
    where clinic_id = current_clinic_id
      and user_id = new.professional_id
      and status = 'active'
      and role in ('clinic_admin', 'doctor')
  ) then
    raise exception using errcode = '42501', message = 'Profissional não pertence à clínica ativa.';
  end if;

  if new.end_time <= new.start_time then
    raise exception using errcode = '23514', message = 'O horário final deve ser posterior ao inicial.';
  end if;

  if new.status = 'cancelled' then
    if nullif(trim(new.cancellation_reason), '') is null then
      raise exception using errcode = '23514', message = 'Informe o motivo do cancelamento.';
    end if;

    new.cancelled_at := coalesce(new.cancelled_at, now());
  else
    new.cancelled_at := null;
    new.cancellation_reason := null;
  end if;

  if new.status not in ('cancelled', 'no_show') and exists (
    select 1
    from public.appointments existing
    where existing.clinic_id = current_clinic_id
      and existing.professional_id = new.professional_id
      and existing.appointment_date = new.appointment_date
      and existing.status not in ('cancelled', 'no_show')
      and existing.id <> new.id
      and new.start_time < existing.end_time
      and new.end_time > existing.start_time
  ) then
    raise exception using errcode = '23P01', message = 'Conflito de horário: o profissional já possui uma consulta neste período.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_appointment_tenant_and_conflict"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_clinical_document_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  lifecycle_change boolean := current_setting('app.document_lifecycle', true) = 'true';
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Sessão expirada.';
  end if;

  select appointment.* into source
  from public.appointments appointment
  join public.profiles profile on profile.id = current_user_id and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member on member.clinic_id = appointment.clinic_id
    and member.user_id = current_user_id and member.status = 'active'
    and member.role in ('doctor', 'clinic_admin')
  where appointment.id = new.appointment_id;

  if source.id is null then
    raise exception using errcode = '42501', message = 'Consulta não pertence à clínica ativa ou o usuário não possui vínculo profissional ativo.';
  end if;
  if source.professional_id <> current_user_id then
    raise exception using errcode = '42501', message = 'Somente o profissional responsável pela consulta pode alterar este documento.';
  end if;

  if tg_op = 'INSERT' then
    new.clinic_id := source.clinic_id;
    new.patient_id := source.patient_id;
    new.professional_id := source.professional_id;
    new.created_by := current_user_id;
    new.status := coalesce(new.status, 'draft');
  else
    if new.clinic_id is distinct from old.clinic_id
      or new.patient_id is distinct from old.patient_id
      or new.appointment_id is distinct from old.appointment_id
      or new.professional_id is distinct from old.professional_id
      or new.created_by is distinct from old.created_by then
      raise exception using errcode = '42501', message = 'Os vínculos do documento não podem ser alterados.';
    end if;

    if old.status in ('finalized', 'signed', 'archived', 'cancelled') then
      if new.snapshot_json is distinct from old.snapshot_json
        or new.rendered_html is distinct from old.rendered_html
        or new.content_hash is distinct from old.content_hash
        or new.hash_algorithm is distinct from old.hash_algorithm
        or new.public_number is distinct from old.public_number
        or new.title is distinct from old.title
        or new.content is distinct from old.content
        or new.template_id is distinct from old.template_id
        or new.template_version is distinct from old.template_version
        or new.renderer_version is distinct from old.renderer_version
        or new.schema_version is distinct from old.schema_version
        or new.issued_at is distinct from old.issued_at
        or new.issued_by is distinct from old.issued_by
        or new.immutable_at is distinct from old.immutable_at then
        insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, result)
        values (old.clinic_id, old.id, current_user_id, 'immutable_update_blocked', 'blocked');
        raise exception using errcode = '42501', message = 'Este documento já foi emitido e não pode ser alterado. Para corrigir as informações, cancele ou substitua o documento e emita uma nova versão.';
      end if;

      if not lifecycle_change and (
        new.status is distinct from old.status
        or new.pdf_storage_path is distinct from old.pdf_storage_path
        or new.pdf_status is distinct from old.pdf_status
        or new.supersedes_document_id is distinct from old.supersedes_document_id
        or new.superseded_by_document_id is distinct from old.superseded_by_document_id
        or new.cancelled_at is distinct from old.cancelled_at
        or new.cancelled_by is distinct from old.cancelled_by
        or new.cancellation_reason is distinct from old.cancellation_reason
      ) then
        raise exception using errcode = '42501', message = 'Use a função segura para alterar o ciclo de vida do documento.';
      end if;
    elsif new.status is distinct from old.status and not lifecycle_change then
      raise exception using errcode = '42501', message = 'Use a função segura para alterar o ciclo de vida do documento.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end
$$;


ALTER FUNCTION "public"."enforce_clinical_document_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_medical_record_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  source_appointment public.appointments%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Você precisa estar autenticado para acessar o prontuário.';
  end if;

  select appointment.* into source_appointment
  from public.appointments appointment
  join public.profiles profile
    on profile.id = current_user_id
   and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member
    on member.clinic_id = appointment.clinic_id
   and member.user_id = current_user_id
   and member.status = 'active'
  where appointment.id = new.appointment_id;

  if source_appointment.id is null then
    raise exception using errcode = '42501', message = 'A consulta não pertence à clínica ativa.';
  end if;
  if source_appointment.professional_id <> current_user_id then
    raise exception using errcode = '42501', message = 'Somente o profissional da consulta pode registrar o prontuário.';
  end if;

  if tg_op = 'INSERT' then
    new.clinic_id := source_appointment.clinic_id;
    new.patient_id := source_appointment.patient_id;
    new.professional_id := source_appointment.professional_id;
  elsif new.clinic_id is distinct from old.clinic_id
     or new.patient_id is distinct from old.patient_id
     or new.appointment_id is distinct from old.appointment_id
     or new.professional_id is distinct from old.professional_id then
    raise exception using errcode = '42501', message = 'Os vínculos do prontuário não podem ser alterados.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_medical_record_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_patient_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  current_clinic_id uuid;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Você precisa estar autenticado para cadastrar pacientes.';
  end if;

  if tg_op = 'INSERT' then
    select profile.active_clinic_id
    into current_clinic_id
    from public.profiles profile
    join public.clinic_members member
      on member.clinic_id = profile.active_clinic_id
     and member.user_id = profile.id
     and member.status = 'active'
    where profile.id = current_user_id;

    if current_clinic_id is null then
      raise exception using
        errcode = '42501',
        message = 'O usuário não possui vínculo ativo com a clínica selecionada.';
    end if;

    new.clinic_id := current_clinic_id;
    new.user_id := current_user_id;
    new.created_by := current_user_id;
    return new;
  end if;

  if new.clinic_id is distinct from old.clinic_id
     or new.user_id is distinct from old.user_id
     or new.created_by is distinct from old.created_by then
    raise exception using
      errcode = '42501',
      message = 'Clínica e autoria do paciente não podem ser alteradas.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_patient_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_professional_profile_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare target_role public.clinic_member_role;
begin
  select role into target_role from public.clinic_members where clinic_id = new.clinic_id and user_id = new.user_id and status = 'active';
  if target_role is null or target_role not in ('doctor','clinic_admin') then raise exception using errcode='42501', message='O profissional precisa ter vínculo ativo com a clínica.'; end if;
  new.updated_at := now(); return new;
end $$;


ALTER FUNCTION "public"."enforce_professional_profile_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."escape_official_document_html"("value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select replace(replace(replace(replace(replace(coalesce(value, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;


ALTER FUNCTION "public"."escape_official_document_html"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_clinical_encounter"("target_appointment_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  target_record public.medical_records%rowtype;
begin
  select appointment.*
  into source
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
    raise exception using
      errcode = '42501',
      message = 'Consulta não encontrada na clínica ativa.';
  end if;
  if source.professional_id <> current_user_id then
    raise exception using
      errcode = '42501',
      message = 'Somente o profissional responsável pode finalizar o atendimento.';
  end if;
  if source.status = 'completed' then
    select *
    into target_record
    from public.medical_records
    where appointment_id = source.id
      and deleted_at is null;
    return target_record.id;
  end if;
  if source.status <> 'in_progress' then
    raise exception using
      errcode = '22023',
      message = 'A consulta precisa estar em atendimento para ser finalizada.';
  end if;

  select *
  into target_record
  from public.medical_records
  where appointment_id = source.id
    and deleted_at is null
  for update;

  if target_record.id is null then
    raise exception using
      errcode = '23514',
      message = 'Salve o prontuário antes de finalizar.';
  end if;
  if nullif(trim(target_record.chief_complaint), '') is null
    or nullif(trim(target_record.assessment), '') is null
    or nullif(trim(target_record.plan), '') is null
  then
    raise exception using
      errcode = '23514',
      message = 'Preencha motivo da consulta, avaliação e conduta antes de finalizar.';
  end if;

  update public.medical_records
  set
    status = 'finalized',
    finalized_at = now(),
    finalized_by = current_user_id,
    last_saved_at = now(),
    updated_at = now()
  where id = target_record.id;

  update public.appointments
  set
    status = 'completed',
    completed_at = now(),
    completed_by = current_user_id,
    updated_at = now()
  where id = source.id;

  return target_record.id;
end
$$;


ALTER FUNCTION "public"."finalize_clinical_encounter"("target_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_clinical_encounter_safe"("target_appointment_id" "uuid", "lock_token" "uuid", "expected_autosave_version" bigint, "acknowledge_alerts" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."finalize_clinical_encounter_safe"("target_appointment_id" "uuid", "lock_token" "uuid", "expected_autosave_version" bigint, "acknowledge_alerts" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_consultation_session"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."finish_consultation_session"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_clinic_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin() or exists (select 1 from public.clinic_members cm where cm.user_id = auth.uid() and cm.clinic_id = public.active_clinic_id() and cm.status = 'active' and cm.role = 'clinic_admin');
$$;


ALTER FUNCTION "public"."is_active_clinic_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_clinic_member"("target_clinic_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin() or exists (select 1 from public.clinic_members cm where cm.user_id = auth.uid() and cm.clinic_id = target_clinic_id and cm.status = 'active' and target_clinic_id = public.active_clinic_id());
$$;


ALTER FUNCTION "public"."is_active_clinic_member"("target_clinic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.clinic_members where user_id = auth.uid() and role = 'platform_admin' and status = 'active');
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_clinical_document"("target_document_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  doc public.clinical_documents%rowtype;
  issued_timestamp timestamptz := now();
  official_snapshot jsonb;
begin
  select * into doc from public.clinical_documents
  where id = target_document_id and clinic_id = public.active_clinic_id() and deleted_at is null
  for update;
  if doc.id is null or doc.professional_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Documento não encontrado na clínica ativa.';
  end if;
  if doc.status = 'finalized' then return doc.id; end if;
  if doc.status not in ('draft', 'in_review') then
    raise exception using errcode = '22023', message = 'Este documento não pode ser finalizado no estado atual.';
  end if;
  if nullif(trim(doc.title), '') is null then
    raise exception using errcode = '23514', message = 'Informe o título antes de finalizar.';
  end if;
  if doc.document_type in ('prescription', 'special_prescription') and not exists (
    select 1 from public.prescription_items item
    where item.document_id = doc.id and item.clinic_id = doc.clinic_id
      and nullif(trim(item.medication_name), '') is not null
  ) then
    raise exception using errcode = '23514', message = 'Adicione ao menos um medicamento antes de finalizar.';
  end if;

  official_snapshot := jsonb_build_object(
    'schema_version', 2,
    'origin', 'native_official',
    'is_legacy', false,
    'title', doc.title,
    'document_type', doc.document_type,
    'public_number', doc.public_number,
    'document_version', doc.document_version,
    'issued_at', issued_timestamp,
    'timezone', 'America/Bahia',
    'status_at_issuance', 'finalized',
    'template', jsonb_build_object('id', 'clinical-document-standard', 'version', 1, 'renderer_version', 1),
    'identifiers', jsonb_build_object(
      'document_id', doc.id, 'clinic_id', doc.clinic_id, 'patient_id', doc.patient_id,
      'appointment_id', doc.appointment_id, 'medical_record_id', doc.medical_record_id,
      'professional_id', doc.professional_id
    ),
    'patient', (
      select jsonb_build_object(
        'id', patient.id, 'name', coalesce(patient.social_name, patient.full_name),
        'legal_name', patient.full_name, 'birth_date', patient.birth_date, 'cpf', patient.cpf
      ) from public.patients patient where patient.id = doc.patient_id
    ),
    'professional', (
      select jsonb_build_object(
        'id', doc.professional_id, 'name', coalesce(professional.professional_name, profile.full_name),
        'legal_name', profile.full_name, 'profession', professional.profession,
        'council', professional.council, 'council_number', professional.council_number,
        'council_state', professional.council_state, 'specialty', professional.specialty,
        'rqe', professional.rqe,
        'registration_text', concat_ws(' ', professional.council, professional.council_number)
          || case when professional.council_state is not null then '/' || professional.council_state else '' end
      )
      from public.profiles profile
      left join public.professional_profiles professional
        on professional.clinic_id = doc.clinic_id and professional.user_id = doc.professional_id
      where profile.id = doc.professional_id
    ),
    'clinic', (
      select (to_jsonb(clinic) - 'created_at' - 'updated_at' - 'status' - 'plan')
        || jsonb_build_object(
          'address_text', concat_ws(', ', clinic.address, clinic.address_number,
            clinic.address_complement, clinic.neighborhood, clinic.city, clinic.state, clinic.zip_code)
        )
      from public.clinics clinic where clinic.id = doc.clinic_id
    ),
    'document_settings', (
      select to_jsonb(settings) - 'updated_at' - 'updated_by'
      from public.document_settings settings where settings.clinic_id = doc.clinic_id
    ),
    'content', doc.content,
    'prescription', jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(to_jsonb(item) - 'clinic_id' - 'document_id' order by item.sort_order)
        from public.prescription_items item where item.document_id = doc.id
      ), '[]'::jsonb)
    )
  );

  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents
  set status = 'finalized', issued_at = issued_timestamp, issued_by = auth.uid(),
    snapshot_json = official_snapshot,
    rendered_html = public.render_official_prescription_html(official_snapshot),
    content_hash = public.canonical_jsonb_sha256(official_snapshot),
    hash_algorithm = 'SHA-256', hash_generated_at = issued_timestamp,
    template_id = 'clinical-document-standard', template_version = 1,
    renderer_version = 1, schema_version = 2, immutable_at = issued_timestamp,
    pdf_status = 'pending'
  where id = doc.id;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, metadata)
  values (doc.clinic_id, doc.id, auth.uid(), 'issued',
    jsonb_build_object('content_hash', public.canonical_jsonb_sha256(official_snapshot), 'schema_version', 2));
  return doc.id;
end
$$;


ALTER FUNCTION "public"."issue_clinical_document"("target_document_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_prescription_document_atomic"("target_appointment_id" "uuid", "medical_record_payload" "jsonb", "prescription_snapshot" "jsonb", "idempotency_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  target_record_id uuid;
  target_document_id uuid;
  target_document_type public.clinical_document_type;
  target_title text;
  target_public_number bigint;
  issued_timestamp timestamptz := now();
  official_snapshot jsonb;
  clinic_snapshot jsonb;
  patient_snapshot jsonb;
  professional_snapshot jsonb;
  settings_snapshot jsonb;
begin
  if current_user_id is null then raise exception using errcode = '28000', message = 'Sessão expirada.'; end if;
  if nullif(trim(idempotency_key), '') is null then raise exception using errcode = '22023', message = 'Chave de idempotência inválida.'; end if;
  if jsonb_typeof(prescription_snapshot -> 'medications') <> 'array'
    or jsonb_array_length(prescription_snapshot -> 'medications') = 0 then
    raise exception using errcode = '23514', message = 'Adicione ao menos um medicamento antes de emitir.';
  end if;

  select appointment.* into source
  from public.appointments appointment
  join public.profiles profile on profile.id = current_user_id and profile.active_clinic_id = appointment.clinic_id
  join public.clinic_members member on member.clinic_id = appointment.clinic_id
    and member.user_id = current_user_id and member.status = 'active'
    and member.role in ('doctor', 'clinic_admin')
  where appointment.id = target_appointment_id
  for update of appointment;

  if source.id is null then raise exception using errcode = '42501', message = 'Consulta não encontrada na clínica ativa.'; end if;
  if source.professional_id <> current_user_id then raise exception using errcode = '42501', message = 'Somente o profissional responsável pode emitir a receita.'; end if;
  if source.status <> 'in_progress' then raise exception using errcode = '22023', message = 'A receita só pode ser emitida durante o atendimento.'; end if;

  select id into target_document_id
  from public.clinical_documents
  where clinic_id = source.clinic_id
    and content ->> 'idempotency_key' = trim(idempotency_key)
    and document_type in ('prescription', 'special_prescription')
    and deleted_at is null;
  if target_document_id is not null then return target_document_id; end if;

  insert into public.medical_records (
    appointment_id, clinic_id, patient_id, professional_id, status,
    chief_complaint, hpi, pmh, medications, allergies, family_history,
    social_history, physical_exam, vital_signs, assessment, cid10, plan,
    prescription, exam_requests, certificate, return_guidance, guidance, last_saved_at
  )
  values (
    source.id, source.clinic_id, source.patient_id, source.professional_id, 'draft',
    nullif(trim(medical_record_payload ->> 'chief_complaint'), ''),
    nullif(trim(medical_record_payload ->> 'hpi'), ''),
    nullif(trim(medical_record_payload ->> 'pmh'), ''),
    nullif(trim(medical_record_payload ->> 'medications'), ''),
    nullif(trim(medical_record_payload ->> 'allergies'), ''),
    nullif(trim(medical_record_payload ->> 'family_history'), ''),
    nullif(trim(medical_record_payload ->> 'social_history'), ''),
    nullif(trim(medical_record_payload ->> 'physical_exam'), ''),
    nullif(trim(medical_record_payload ->> 'vital_signs'), ''),
    nullif(trim(medical_record_payload ->> 'assessment'), ''),
    nullif(trim(medical_record_payload ->> 'cid10'), ''),
    nullif(trim(medical_record_payload ->> 'plan'), ''),
    nullif(trim(medical_record_payload ->> 'prescription'), ''),
    nullif(trim(medical_record_payload ->> 'exam_requests'), ''),
    nullif(trim(medical_record_payload ->> 'certificate'), ''),
    nullif(trim(medical_record_payload ->> 'return_guidance'), ''),
    nullif(trim(medical_record_payload ->> 'guidance'), ''),
    issued_timestamp
  )
  on conflict (appointment_id) where deleted_at is null
  do update set
    chief_complaint = excluded.chief_complaint, hpi = excluded.hpi, pmh = excluded.pmh,
    medications = excluded.medications, allergies = excluded.allergies,
    family_history = excluded.family_history, social_history = excluded.social_history,
    physical_exam = excluded.physical_exam, vital_signs = excluded.vital_signs,
    assessment = excluded.assessment, cid10 = excluded.cid10, plan = excluded.plan,
    prescription = excluded.prescription, exam_requests = excluded.exam_requests,
    certificate = excluded.certificate, return_guidance = excluded.return_guidance,
    guidance = excluded.guidance, last_saved_at = issued_timestamp, updated_at = issued_timestamp
  where medical_records.status = 'draft'
  returning id into target_record_id;
  if target_record_id is null then raise exception using errcode = '42501', message = 'O prontuário finalizado não pode receber alterações.'; end if;

  target_document_type := case prescription_snapshot ->> 'type'
    when 'special_control' then 'special_prescription'::public.clinical_document_type
    else 'prescription'::public.clinical_document_type end;
  target_title := case target_document_type
    when 'special_prescription' then 'Receita de controle especial'
    else 'Receita médica' end;

  select to_jsonb(clinic) - 'created_at' - 'updated_at' - 'status' - 'plan'
  into clinic_snapshot from public.clinics clinic where clinic.id = source.clinic_id;
  select jsonb_build_object(
    'id', patient.id, 'name', coalesce(patient.social_name, patient.full_name),
    'legal_name', patient.full_name, 'birth_date', patient.birth_date, 'cpf', patient.cpf
  ) into patient_snapshot from public.patients patient where patient.id = source.patient_id;
  select jsonb_build_object(
    'id', source.professional_id,
    'name', coalesce(professional.professional_name, profile.full_name),
    'legal_name', profile.full_name,
    'profession', professional.profession,
    'council', professional.council,
    'council_number', professional.council_number,
    'council_state', professional.council_state,
    'specialty', professional.specialty,
    'rqe', professional.rqe,
    'registration_text', concat_ws(' ', professional.council, professional.council_number)
      || case when professional.council_state is not null then '/' || professional.council_state else '' end
  ) into professional_snapshot
  from public.profiles profile
  left join public.professional_profiles professional
    on professional.clinic_id = source.clinic_id and professional.user_id = source.professional_id
  where profile.id = source.professional_id;
  select to_jsonb(settings) - 'updated_at' - 'updated_by'
  into settings_snapshot from public.document_settings settings where settings.clinic_id = source.clinic_id;

  insert into public.clinical_documents (
    clinic_id, patient_id, appointment_id, medical_record_id, professional_id,
    document_type, title, content, status, created_by, issued_at, issued_by,
    template_id, template_version, renderer_version, schema_version,
    document_version, immutable_at, pdf_status
  )
  values (
    source.clinic_id, source.patient_id, source.id, target_record_id, source.professional_id,
    target_document_type, target_title,
    jsonb_build_object('idempotency_key', trim(idempotency_key), 'text', coalesce(medical_record_payload ->> 'prescription', '')),
    'draft', current_user_id, issued_timestamp, current_user_id,
    'prescription-simple', 1, 1, 2, 1, issued_timestamp, 'pending'
  )
  returning id, public_number into target_document_id, target_public_number;

  official_snapshot := jsonb_build_object(
    'schema_version', 2,
    'origin', 'native_official',
    'is_legacy', false,
    'title', target_title,
    'document_type', target_document_type,
    'public_number', target_public_number,
    'document_version', 1,
    'issued_at', issued_timestamp,
    'timezone', 'America/Bahia',
    'status_at_issuance', 'finalized',
    'template', jsonb_build_object('id', 'prescription-simple', 'version', 1, 'renderer_version', 1),
    'identifiers', jsonb_build_object(
      'document_id', target_document_id, 'clinic_id', source.clinic_id,
      'patient_id', source.patient_id, 'appointment_id', source.id,
      'medical_record_id', target_record_id, 'professional_id', source.professional_id,
      'prescription_id', prescription_snapshot ->> 'id'
    ),
    'patient', patient_snapshot,
    'professional', professional_snapshot,
    'clinic', coalesce(clinic_snapshot, '{}'::jsonb)
      || jsonb_build_object(
        'address_text', concat_ws(', ',
          clinic_snapshot ->> 'address', clinic_snapshot ->> 'address_number',
          clinic_snapshot ->> 'address_complement', clinic_snapshot ->> 'neighborhood',
          clinic_snapshot ->> 'city', clinic_snapshot ->> 'state',
          clinic_snapshot ->> 'zip_code')
      ),
    'document_settings', coalesce(settings_snapshot, '{}'::jsonb),
    'prescription', jsonb_build_object(
      'payload', prescription_snapshot - '_official_presentation',
      'presentation', coalesce(prescription_snapshot -> '_official_presentation', '{}'::jsonb)
    )
  );

  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents
  set
    snapshot_json = official_snapshot,
    rendered_html = public.render_official_prescription_html(official_snapshot),
    content_hash = public.canonical_jsonb_sha256(official_snapshot),
    hash_algorithm = 'SHA-256',
    hash_generated_at = issued_timestamp,
    status = 'finalized',
    updated_at = issued_timestamp
  where id = target_document_id;

  insert into public.prescription_items (
    clinic_id, document_id, medication_name, concentration, pharmaceutical_form,
    route, dosage, frequency, duration, quantity, instructions, controlled, sort_order
  )
  select source.clinic_id, target_document_id, trim(item.value ->> 'name'),
    coalesce(item.value ->> 'concentration', ''),
    coalesce(item.value ->> 'presentation', item.value ->> 'pharmaceuticalForm', ''),
    coalesce(item.value ->> 'route', ''), coalesce(item.value ->> 'dose', ''),
    coalesce(item.value ->> 'frequency', ''), coalesce(item.value ->> 'duration', ''),
    coalesce(item.value ->> 'quantity', ''), coalesce(item.value ->> 'notes', ''),
    target_document_type = 'special_prescription', item.ordinality - 1
  from jsonb_array_elements(prescription_snapshot -> 'medications') with ordinality as item(value, ordinality)
  where nullif(trim(item.value ->> 'name'), '') is not null;
  if not found then raise exception using errcode = '23514', message = 'A receita não possui medicamentos válidos.'; end if;

  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, metadata)
  values (
    source.clinic_id, target_document_id, current_user_id, 'issued',
    jsonb_build_object('hash_algorithm', 'SHA-256', 'content_hash', public.canonical_jsonb_sha256(official_snapshot), 'schema_version', 2)
  );
  return target_document_id;
end
$$;


ALTER FUNCTION "public"."issue_prescription_document_atomic"("target_appointment_id" "uuid", "medical_record_payload" "jsonb", "prescription_snapshot" "jsonb", "idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_active_clinic_team"() RETURNS TABLE("record_type" "text", "id" "uuid", "user_id" "uuid", "full_name" "text", "email" "text", "role" "public"."clinic_member_role", "status" "text", "created_at" timestamp with time zone, "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."list_active_clinic_team"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_appointment_has_addendum"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare target_appointment uuid;
begin
  select appointment_id into target_appointment from public.medical_records where id = new.medical_record_id;
  update public.appointments set has_addendum=true where id=target_appointment;
  insert into public.consultation_finalization_events(clinic_id, appointment_id, medical_record_id, actor_id, event_type, previous_status, new_status, metadata)
  values(new.clinic_id, target_appointment, new.medical_record_id, new.created_by, 'addendum_created', 'completed', 'completed', jsonb_build_object('addendum_id', new.id, 'reason', new.reason));
  return new;
end $$;


ALTER FUNCTION "public"."mark_appointment_has_addendum"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_clinical_document_printed"("target_document_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare target public.clinical_documents%rowtype;
begin
  select * into target from public.clinical_documents
  where id = target_document_id and clinic_id = public.active_clinic_id()
    and status in ('finalized', 'signed', 'archived', 'cancelled');
  if target.id is null then return; end if;
  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents set printed_at = coalesce(printed_at, now()) where id = target.id;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type)
  values (target.clinic_id, target.id, auth.uid(), case when target.printed_at is null then 'printed' else 'reprinted' end);
end
$$;


ALTER FUNCTION "public"."mark_clinical_document_printed"("target_document_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_or_resume_consultation"("target_appointment_id" "uuid", "lock_token" "uuid") RETURNS "public"."appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."open_or_resume_consultation"("target_appointment_id" "uuid", "lock_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_clinic_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."protect_clinic_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_finalized_medical_record"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status in ('finalized', 'amended') then
    raise exception using
      errcode = '42501',
      message = 'Prontuário finalizado não pode ser alterado. Registre um adendo administrativo.';
  end if;
  new.last_saved_at := now();
  return new;
end
$$;


ALTER FUNCTION "public"."protect_finalized_medical_record"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_clinic_invite_delivery"("invite_id" "uuid", "delivery_succeeded" boolean, "delivery_code" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  selected_clinic_id uuid := public.current_clinic_admin_id();
  old_status text;
  new_status text;
BEGIN
  IF selected_clinic_id IS NULL THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Sem permissão para atualizar convites.';
  END IF;

  SELECT ci.status
  INTO old_status
  FROM public.clinic_invites AS ci
  WHERE ci.id = invite_id
    AND ci.clinic_id = selected_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Convite não encontrado nesta clínica.';
  END IF;

  IF old_status NOT IN ('pending', 'sent', 'failed') THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Este convite não pode mais ter sua entrega atualizada.';
  END IF;

  new_status := CASE
    WHEN delivery_succeeded THEN 'sent'
    ELSE 'failed'
  END;

  UPDATE public.clinic_invites AS ci
  SET
    status = new_status,
    last_sent_at = now(),
    send_count = ci.send_count + 1,
    delivery_error_code = CASE
      WHEN delivery_succeeded THEN NULL
      ELSE left(
        coalesce(delivery_code, 'EMAIL_DELIVERY_FAILED'),
        80
      )
    END,
    updated_at = now()
  WHERE ci.id = invite_id
    AND ci.clinic_id = selected_clinic_id
    AND ci.status IN ('pending', 'sent', 'failed');

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Este convite não pode mais ter sua entrega atualizada.';
  END IF;

  INSERT INTO public.clinic_audit_logs (
    clinic_id,
    actor_id,
    event_type,
    metadata
  )
  VALUES (
    selected_clinic_id,
    auth.uid(),
    CASE
      WHEN delivery_succeeded THEN 'invite_sent'
      ELSE 'invite_send_failed'
    END,
    jsonb_build_object(
      'invite_id', invite_id,
      'previous_status', old_status,
      'new_status', new_status
    )
  );
END;
$$;


ALTER FUNCTION "public"."record_clinic_invite_delivery"("invite_id" "uuid", "delivery_succeeded" boolean, "delivery_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_clinical_document_access"("target_document_id" "uuid", "access_event" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target public.clinical_documents%rowtype;
begin
  if access_event not in ('viewed', 'downloaded', 'integrity_checked') then
    raise exception using errcode = '22023', message = 'Evento de acesso documental inválido.';
  end if;
  select * into target from public.clinical_documents
  where id = target_document_id and clinic_id = public.active_clinic_id()
    and deleted_at is null;
  if target.id is null then
    raise exception using errcode = 'P0002', message = 'Documento não encontrado na clínica ativa.';
  end if;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type)
  values (target.clinic_id, target.id, auth.uid(), access_event);
end
$$;


ALTER FUNCTION "public"."record_clinical_document_access"("target_document_id" "uuid", "access_event" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_consultation_finalization_failure"("target_appointment_id" "uuid", "failure_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."record_consultation_finalization_failure"("target_appointment_id" "uuid", "failure_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_active_clinic_member"("member_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."remove_active_clinic_member"("member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."render_official_prescription_html"("snapshot" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
declare
  item jsonb;
  medications_html text := '';
begin
  for item in
    select value from jsonb_array_elements(coalesce(snapshot #> '{prescription,presentation,medications}', '[]'::jsonb))
  loop
    medications_html := medications_html || format(
      '<section><h3>%s</h3><p>%s</p><p>%s</p><p>%s</p></section>',
      public.escape_official_document_html(item ->> 'name'),
      public.escape_official_document_html(item ->> 'formAndPackage'),
      public.escape_official_document_html(item ->> 'posology'),
      public.escape_official_document_html(item ->> 'quantity')
    );
  end loop;

  return format(
    '<article data-aster-document="official" data-schema-version="%s"><header><h1>%s</h1><p>%s</p></header><h2>%s</h2><p>Paciente: %s</p><p>Documento nº %s</p>%s<footer><strong>%s</strong><p>%s</p></footer></article>',
    coalesce(snapshot ->> 'schema_version', '1'),
    public.escape_official_document_html(snapshot #>> '{clinic,name}'),
    public.escape_official_document_html(snapshot #>> '{clinic,address_text}'),
    public.escape_official_document_html(snapshot ->> 'title'),
    public.escape_official_document_html(snapshot #>> '{patient,name}'),
    public.escape_official_document_html(snapshot ->> 'public_number'),
    medications_html,
    public.escape_official_document_html(snapshot #>> '{professional,name}'),
    public.escape_official_document_html(snapshot #>> '{professional,registration_text}')
  );
end
$$;


ALTER FUNCTION "public"."render_official_prescription_html"("snapshot" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."renew_active_clinic_invite"("invite_id" "uuid") RETURNS TABLE("email" "text", "full_name" "text", "clinic_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  selected_clinic_id uuid := public.current_clinic_admin_id();
  last_delivery timestamptz;
BEGIN
  IF selected_clinic_id IS NULL THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Sem permissão para reenviar convites desta clínica.';
  END IF;

  SELECT ci.last_sent_at
  INTO last_delivery
  FROM public.clinic_invites ci
  WHERE ci.id = invite_id
    AND ci.clinic_id = selected_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Convite não encontrado nesta clínica.';
  END IF;

  IF last_delivery IS NOT NULL
    AND last_delivery > now() - interval '60 seconds' THEN
    RAISE EXCEPTION USING
      errcode = '55000',
      message = 'Aguarde um minuto antes de reenviar o convite.';
  END IF;

  RETURN QUERY
  UPDATE public.clinic_invites ci
  SET
    status = 'pending',
    token = gen_random_uuid(),
    expires_at = now() + interval '7 days',
    updated_at = now()
  WHERE ci.id = invite_id
    AND ci.clinic_id = selected_clinic_id
    AND ci.status IN ('pending', 'sent', 'expired', 'failed')
  RETURNING
    ci.email,
    ci.full_name,
    ci.clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      errcode = '55000',
      message = 'Este convite não está disponível para reenvio.';
  END IF;
END;
$$;


ALTER FUNCTION "public"."renew_active_clinic_invite"("invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."renew_consultation_lock"("target_appointment_id" "uuid", "lock_token" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare lock_expiry timestamptz;
begin
  update public.appointments set consultation_lock_until = now() + interval '90 seconds', consultation_last_activity = now()
  where id = target_appointment_id and professional_id = auth.uid() and status = 'in_progress' and consultation_lock_token = lock_token
    and public.is_active_clinic_member(clinic_id)
  returning consultation_lock_until into lock_expiry;
  if lock_expiry is null then raise exception using errcode = '55P03', message = 'A sessão de edição expirou ou está ativa em outra aba.'; end if;
  return lock_expiry;
end $$;


ALTER FUNCTION "public"."renew_consultation_lock"("target_appointment_id" "uuid", "lock_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_active_clinic_invite"("invite_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."revoke_active_clinic_invite"("invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_medication_catalog"("search_term" "text", "result_limit" integer DEFAULT 20) RETURNS TABLE("source_key" "text", "presentation_id" "text", "product_name" "text", "active_ingredient" "text", "concentration" "text", "pharmaceutical_form" "text", "presentation" "text", "package_description" "text", "therapeutic_class" "text", "regulatory_category" "text", "registration_number" "text", "registration_holder" "text", "regulatory_status" "text", "manufacturer" "text", "ean" "text", "product_type" "text", "source" "text", "source_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  normalized_term text := trim(coalesce(search_term, ''));
  comparable_term text := extensions.unaccent(lower(normalized_term));
  safe_limit integer := least(greatest(coalesce(result_limit, 20), 1), 30);
begin
  if auth.uid() is null or public.active_clinic_id() is null then
    raise exception using errcode = '42501', message = 'Sessão ou clínica ativa inválida.';
  end if;
  if length(normalized_term) < 2 then return; end if;

  return query
  with latest_import as (
    select imports.*
    from public.medication_presentation_imports imports
    where imports.status = 'completed'
    order by imports.completed_at desc
    limit 1
  ),
  latest_presentations as (
    select presentations.*, imports.source, imports.source_published_at
    from public.medication_presentations presentations
    join latest_import imports on imports.id = presentations.source_import_id
  ),
  latest_catalog as (
    select catalog.*
    from public.medication_catalog catalog
    where catalog.registration_status = 'Ativo'
      and catalog.source_import_id = (
        select imports.id
        from public.medication_catalog_imports imports
        where imports.source = 'ANVISA_DADOS_ABERTOS'
          and imports.status = 'completed'
        order by imports.completed_at desc
        limit 1
      )
  )
  select
    coalesce(catalog.source_key, presentation.ggrem_code),
    presentation.ggrem_code,
    presentation.product_name,
    coalesce(catalog.active_ingredient, presentation.substance),
    presentation.concentration,
    presentation.pharmaceutical_form,
    presentation.presentation,
    presentation.package_description,
    coalesce(catalog.therapeutic_class, presentation.therapeutic_class),
    catalog.regulatory_category,
    coalesce(catalog.registration_number, presentation.product_registration_number),
    catalog.registration_holder,
    catalog.registration_status,
    presentation.manufacturer,
    presentation.ean,
    presentation.product_type,
    presentation.source,
    presentation.source_published_at
  from latest_presentations presentation
  left join latest_catalog catalog
    on catalog.registration_number = presentation.product_registration_number
  where
    extensions.unaccent(lower(presentation.product_name)) like '%' || comparable_term || '%'
    or extensions.unaccent(lower(presentation.substance)) like '%' || comparable_term || '%'
    or extensions.unaccent(lower(presentation.presentation)) like '%' || comparable_term || '%'
    or extensions.unaccent(lower(presentation.manufacturer)) like '%' || comparable_term || '%'
    or coalesce(presentation.product_registration_number, '') = normalized_term
  order by
    case
      when extensions.unaccent(lower(presentation.product_name)) = comparable_term then 0
      when extensions.unaccent(lower(presentation.substance)) = comparable_term then 1
      when extensions.unaccent(lower(presentation.product_name)) like comparable_term || '%' then 2
      when extensions.unaccent(lower(presentation.substance)) like comparable_term || '%' then 3
      else 4
    end,
    similarity(lower(presentation.product_name), lower(normalized_term)) desc,
    presentation.product_name,
    presentation.presentation
  limit safe_limit;
end;
$$;


ALTER FUNCTION "public"."search_medication_catalog"("search_term" "text", "result_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_clinic"("target_clinic_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from public.clinic_members where user_id = auth.uid() and clinic_id = target_clinic_id and status = 'active') and not public.is_platform_admin() then raise exception 'Sem vínculo ativo com esta clínica'; end if;
  update public.profiles set active_clinic_id = target_clinic_id where id = auth.uid();
end; $$;


ALTER FUNCTION "public"."set_active_clinic"("target_clinic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_clinical_document_pdf_result"("target_document_id" "uuid", "storage_path" "text", "generation_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target public.clinical_documents%rowtype;
  expected_prefix text;
begin
  if generation_status not in ('available', 'failed') then
    raise exception using errcode = '22023', message = 'Estado de geração do PDF inválido.';
  end if;
  select * into target from public.clinical_documents
  where id = target_document_id and clinic_id = public.active_clinic_id()
    and professional_id = auth.uid() and deleted_at is null
  for update;
  if target.id is null or target.status not in ('finalized', 'signed') then
    raise exception using errcode = '42501', message = 'Documento oficial não encontrado para vincular o PDF.';
  end if;
  if target.pdf_storage_path is not null then
    if target.pdf_storage_path = storage_path and target.pdf_status = 'available' then return; end if;
    raise exception using errcode = '23505', message = 'O documento já possui um PDF oficial e ele não pode ser sobrescrito.';
  end if;
  expected_prefix := format('clinics/%s/documents/%s/', target.clinic_id, target.id);
  if generation_status = 'available'
    and (storage_path is null or left(storage_path, length(expected_prefix)) <> expected_prefix) then
    raise exception using errcode = '22023', message = 'Caminho do PDF oficial inválido.';
  end if;
  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents
  set pdf_storage_path = case when generation_status = 'available' then storage_path else null end,
    pdf_status = generation_status
  where id = target.id;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, result, metadata)
  values (
    target.clinic_id, target.id, auth.uid(), 'pdf_generation',
    case when generation_status = 'available' then 'success' else 'failed' end,
    jsonb_build_object('storage_path', storage_path)
  );
end
$$;


ALTER FUNCTION "public"."set_clinical_document_pdf_result"("target_document_id" "uuid", "storage_path" "text", "generation_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settings_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$ begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;


ALTER FUNCTION "public"."settings_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settings_touch_entity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$ begin new.updated_at = now(); return new; end $$;


ALTER FUNCTION "public"."settings_touch_entity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_clinical_encounter"("target_appointment_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  source public.appointments%rowtype;
  target_record_id uuid;
begin
  select appointment.*
  into source
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
    raise exception using
      errcode = '42501',
      message = 'Consulta não encontrada na clínica ativa.';
  end if;
  if source.professional_id <> current_user_id then
    raise exception using
      errcode = '42501',
      message = 'Somente o profissional responsável pode iniciar o atendimento.';
  end if;
  if source.status not in ('waiting', 'in_progress') then
    raise exception using
      errcode = '22023',
      message = 'A consulta precisa estar aguardando para iniciar o atendimento.';
  end if;

  update public.appointments
  set
    status = 'in_progress',
    started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = source.id;

  insert into public.medical_records (
    appointment_id,
    clinic_id,
    patient_id,
    professional_id,
    status,
    last_saved_at
  )
  values (
    source.id,
    source.clinic_id,
    source.patient_id,
    source.professional_id,
    'draft',
    now()
  )
  on conflict (appointment_id) where deleted_at is null
  do update set appointment_id = excluded.appointment_id
  returning id into target_record_id;

  return target_record_id;
end
$$;


ALTER FUNCTION "public"."start_clinical_encounter"("target_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supersede_clinical_document"("previous_document_id" "uuid", "replacement_document_id" "uuid", "reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  previous_doc public.clinical_documents%rowtype;
  replacement_doc public.clinical_documents%rowtype;
begin
  if nullif(trim(reason), '') is null then raise exception using errcode = '23514', message = 'Informe o motivo da substituição.'; end if;
  select * into previous_doc from public.clinical_documents
    where id = previous_document_id and clinic_id = public.active_clinic_id() for update;
  select * into replacement_doc from public.clinical_documents
    where id = replacement_document_id and clinic_id = public.active_clinic_id() for update;
  if previous_doc.id is null or replacement_doc.id is null then raise exception using errcode = 'P0002', message = 'Documento da cadeia de versões não encontrado.'; end if;
  if previous_doc.professional_id <> auth.uid() or replacement_doc.professional_id <> auth.uid()
    or previous_doc.patient_id <> replacement_doc.patient_id
    or previous_doc.document_type <> replacement_doc.document_type then
    raise exception using errcode = '42501', message = 'Os documentos não podem formar uma cadeia de versões.';
  end if;
  if previous_doc.status not in ('finalized', 'signed') or replacement_doc.status <> 'finalized' then
    raise exception using errcode = '22023', message = 'A substituição exige dois documentos oficiais válidos.';
  end if;
  perform set_config('app.document_lifecycle', 'true', true);
  update public.clinical_documents set status = 'archived',
    superseded_by_document_id = replacement_doc.id, cancellation_reason = trim(reason)
    where id = previous_doc.id;
  update public.clinical_documents set supersedes_document_id = previous_doc.id
    where id = replacement_doc.id;
  insert into public.clinical_document_audit_events(clinic_id, document_id, actor_id, event_type, metadata)
  values
    (previous_doc.clinic_id, previous_doc.id, auth.uid(), 'superseded', jsonb_build_object('replacement_document_id', replacement_doc.id, 'reason', trim(reason))),
    (replacement_doc.clinic_id, replacement_doc.id, auth.uid(), 'supersedes', jsonb_build_object('previous_document_id', previous_doc.id, 'reason', trim(reason)));
  return replacement_doc.id;
end
$$;


ALTER FUNCTION "public"."supersede_clinical_document"("previous_document_id" "uuid", "replacement_document_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_clinical_document_draft_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status = 'draft' and (new.title is distinct from old.title or new.content is distinct from old.content) then
    new.document_version := coalesce(old.document_version, 1) + 1;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."track_clinical_document_draft_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_active_clinic_member"("member_id" "uuid", "member_role" "text" DEFAULT NULL::"text", "member_status" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."update_active_clinic_member"("member_id" "uuid", "member_role" "text", "member_status" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_clinical_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "medical_record_id" "uuid",
    "professional_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "input_hash" "text" NOT NULL,
    "model" "text" NOT NULL,
    "generated_sections" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "accepted_sections" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "discarded_at" timestamp with time zone,
    "request_type" "text",
    CONSTRAINT "ai_clinical_generations_input_hash_check" CHECK (("length"("input_hash") = 64)),
    CONSTRAINT "ai_clinical_generations_request_type_check" CHECK ((("request_type" IS NULL) OR ("request_type" = ANY (ARRAY['structured_anamnesis'::"text", 'soap'::"text", 'hypotheses'::"text", 'cid10'::"text", 'exams'::"text", 'conduct'::"text"])))),
    CONSTRAINT "ai_clinical_generations_status_check" CHECK (("status" = ANY (ARRAY['generated'::"text", 'accepted'::"text", 'discarded'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_clinical_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_prescription_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prompt_version" "text" NOT NULL,
    "model" "text" NOT NULL,
    "generated_prescription" "jsonb" NOT NULL,
    "final_prescription" "jsonb",
    "status" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_prescription_generations_status_check" CHECK (("status" = ANY (ARRAY['generated'::"text", 'inserted'::"text", 'discarded'::"text"])))
);


ALTER TABLE "public"."ai_prescription_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_settings" (
    "clinic_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "language" "text" DEFAULT 'pt-BR'::"text" NOT NULL,
    "default_specialty" "text",
    "detail_level" "text" DEFAULT 'standard'::"text" NOT NULL,
    "evolution_format" "text" DEFAULT 'free'::"text" NOT NULL,
    "suggest_cid" boolean DEFAULT true NOT NULL,
    "suggest_differentials" boolean DEFAULT false NOT NULL,
    "suggest_exams" boolean DEFAULT false NOT NULL,
    "suggest_conduct" boolean DEFAULT false NOT NULL,
    "require_human_review" boolean DEFAULT true NOT NULL,
    "consent_text" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."ai_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."care_continuity_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "continuity_item_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "previous_status" "text",
    "new_status" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "care_continuity_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'assigned'::"text", 'status_changed'::"text", 'scheduled'::"text", 'contact_recorded'::"text", 'completed'::"text", 'cancelled'::"text", 'reopened'::"text", 'result_received'::"text", 'result_reviewed'::"text"])))
);


ALTER TABLE "public"."care_continuity_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."care_continuity_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "assigned_to" "uuid",
    "assigned_sector" "text",
    "item_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "text" DEFAULT 'routine'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "due_at" timestamp with time zone,
    "scheduled_appointment_id" "uuid",
    "clinical_document_id" "uuid",
    "source_key" "text" NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancellation_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "care_continuity_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['follow_up'::"text", 'referral'::"text", 'exam'::"text", 'exam_result'::"text", 'document'::"text", 'conduct'::"text", 'other'::"text"]))),
    CONSTRAINT "care_continuity_items_priority_check" CHECK (("priority" = ANY (ARRAY['routine'::"text", 'preferred'::"text", 'priority'::"text", 'urgent'::"text"]))),
    CONSTRAINT "care_continuity_items_status_check" CHECK (("status" = ANY (ARRAY['recommended'::"text", 'pending'::"text", 'scheduled'::"text", 'confirmed'::"text", 'in_progress'::"text", 'result_available'::"text", 'reviewed'::"text", 'completed'::"text", 'cancelled'::"text", 'dismissed'::"text", 'no_show'::"text"]))),
    CONSTRAINT "care_continuity_items_title_check" CHECK (("length"(TRIM(BOTH FROM "title")) > 0))
);


ALTER TABLE "public"."care_continuity_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinic_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "target_user_id" "uuid",
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clinic_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinic_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "public"."clinic_member_role" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "accepted_by" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_user_id" "uuid",
    "onboarding_started_at" timestamp with time zone,
    "onboarding_completed_at" timestamp with time zone,
    CONSTRAINT "clinic_invites_assignable_role" CHECK (("role" <> 'platform_admin'::"public"."clinic_member_role")),
    CONSTRAINT "clinic_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."clinic_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinic_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."clinic_member_role" DEFAULT 'receptionist'::"public"."clinic_member_role" NOT NULL,
    "status" "public"."clinic_member_status" DEFAULT 'active'::"public"."clinic_member_status" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clinic_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinic_settings" (
    "clinic_id" "uuid" NOT NULL,
    "default_appointment_duration" integer DEFAULT 30 NOT NULL,
    "appointment_interval" integer DEFAULT 0 NOT NULL,
    "business_start" time without time zone,
    "business_end" time without time zone,
    "lunch_start" time without time zone,
    "lunch_end" time without time zone,
    "service_days" "jsonb" DEFAULT '[1, 2, 3, 4, 5]'::"jsonb" NOT NULL,
    "allow_waitlist" boolean DEFAULT true NOT NULL,
    "minimum_booking_notice" integer DEFAULT 0 NOT NULL,
    "maximum_booking_horizon" integer DEFAULT 90 NOT NULL,
    "holidays" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "blocked_periods" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."clinic_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_document_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "event_type" "text" NOT NULL,
    "result" "text" DEFAULT 'success'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clinical_document_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "medical_record_id" "uuid",
    "professional_id" "uuid" NOT NULL,
    "document_type" "public"."clinical_document_type" NOT NULL,
    "title" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "public_number" bigint NOT NULL,
    "status" "public"."clinical_document_status" DEFAULT 'draft'::"public"."clinical_document_status" NOT NULL,
    "issued_at" timestamp with time zone,
    "issued_by" "uuid",
    "printed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancellation_reason" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "snapshot_json" "jsonb",
    "rendered_html" "text",
    "pdf_storage_path" "text",
    "pdf_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "content_hash" "text",
    "hash_algorithm" "text",
    "hash_generated_at" timestamp with time zone,
    "template_id" "text",
    "template_version" integer,
    "renderer_version" integer,
    "schema_version" integer,
    "document_version" integer DEFAULT 1 NOT NULL,
    "immutable_at" timestamp with time zone,
    "supersedes_document_id" "uuid",
    "superseded_by_document_id" "uuid",
    "legacy_migrated_at" timestamp with time zone,
    "legacy_source" "text",
    "legacy_confidence" "text",
    "generated_by_ai" boolean DEFAULT false NOT NULL,
    "reviewed_by_physician" boolean DEFAULT false NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "signed_at" timestamp with time zone,
    "signature_provider" "text",
    "signature_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "clinical_documents_distinct_version_links_check" CHECK (((("supersedes_document_id" IS NULL) OR ("supersedes_document_id" <> "id")) AND (("superseded_by_document_id" IS NULL) OR ("superseded_by_document_id" <> "id")))),
    CONSTRAINT "clinical_documents_hash_algorithm_check" CHECK ((("hash_algorithm" IS NULL) OR ("hash_algorithm" = 'SHA-256'::"text"))),
    CONSTRAINT "clinical_documents_legacy_confidence_check" CHECK ((("legacy_confidence" IS NULL) OR ("legacy_confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"])))),
    CONSTRAINT "clinical_documents_pdf_status_check" CHECK (("pdf_status" = ANY (ARRAY['pending'::"text", 'available'::"text", 'failed'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "clinical_documents_physician_review_required" CHECK ((("status" <> ALL (ARRAY['finalized'::"public"."clinical_document_status", 'signed'::"public"."clinical_document_status", 'archived'::"public"."clinical_document_status"])) OR "reviewed_by_physician"))
);


ALTER TABLE "public"."clinical_documents" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."clinical_document_public_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."clinical_document_public_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."clinical_document_public_number_seq" OWNED BY "public"."clinical_documents"."public_number";



CREATE TABLE IF NOT EXISTS "public"."clinical_document_template_favorites" (
    "clinic_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_id" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clinical_document_template_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_document_templates" (
    "id" "text" NOT NULL,
    "clinic_id" "uuid",
    "document_type" "public"."clinical_document_type" NOT NULL,
    "name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clinical_document_templates_name_check" CHECK ((TRIM(BOTH FROM "name") <> ''::"text")),
    CONSTRAINT "clinical_document_templates_title_check" CHECK ((TRIM(BOTH FROM "title") <> ''::"text")),
    CONSTRAINT "clinical_document_templates_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."clinical_document_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_transcription_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "consent_confirmed" boolean DEFAULT false NOT NULL,
    "duration_seconds" integer,
    "file_size_bytes" bigint,
    "model" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clinical_transcription_events_duration_seconds_check" CHECK ((("duration_seconds" IS NULL) OR ("duration_seconds" >= 0))),
    CONSTRAINT "clinical_transcription_events_file_size_bytes_check" CHECK ((("file_size_bytes" IS NULL) OR ("file_size_bytes" >= 0))),
    CONSTRAINT "clinical_transcription_events_status_check" CHECK (("status" = ANY (ARRAY['consent_confirmed'::"text", 'transcription_requested'::"text", 'transcription_completed'::"text", 'transcription_failed'::"text", 'transcription_cancelled'::"text"])))
);


ALTER TABLE "public"."clinical_transcription_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "legal_name" "text",
    "cnpj" "text",
    "email" "text",
    "phone" "text",
    "status" "public"."clinic_status" DEFAULT 'active'::"public"."clinic_status" NOT NULL,
    "plan" "public"."clinic_plan" DEFAULT 'starter'::"public"."clinic_plan" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logo_url" "text",
    "address" "text",
    "cnes" "text",
    "whatsapp" "text",
    "zip_code" "text",
    "address_number" "text",
    "address_complement" "text",
    "neighborhood" "text",
    "city" "text",
    "state" "text",
    "website" "text",
    "instagram" "text",
    "favicon_url" "text"
);


ALTER TABLE "public"."clinics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consultation_finalization_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "medical_record_id" "uuid",
    "actor_id" "uuid",
    "event_type" "text" NOT NULL,
    "previous_status" "text",
    "new_status" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "consultation_finalization_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['requested'::"text", 'finalized'::"text", 'failed'::"text", 'reopened'::"text", 'addendum_created'::"text", 'return_scheduled'::"text"])))
);


ALTER TABLE "public"."consultation_finalization_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_settings" (
    "clinic_id" "uuid" NOT NULL,
    "header_text" "text",
    "footer_text" "text",
    "default_city" "text",
    "signature_text" "text",
    "show_logo" boolean DEFAULT true NOT NULL,
    "show_cnpj" boolean DEFAULT true NOT NULL,
    "show_address" boolean DEFAULT true NOT NULL,
    "show_phone" boolean DEFAULT true NOT NULL,
    "show_email" boolean DEFAULT true NOT NULL,
    "show_council" boolean DEFAULT true NOT NULL,
    "show_specialty" boolean DEFAULT true NOT NULL,
    "show_rqe" boolean DEFAULT true NOT NULL,
    "physical_signature_space" boolean DEFAULT true NOT NULL,
    "automatic_numbering" boolean DEFAULT true NOT NULL,
    "document_prefix" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."document_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorite_prescriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "document_type" "public"."clinical_document_type" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."favorite_prescriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."longitudinal_clinical_summaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "generated_by" "uuid" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_record_at" timestamp with time zone,
    "records_count" integer DEFAULT 0 NOT NULL,
    "model" "text" NOT NULL,
    "schema_version" "text" NOT NULL,
    "summary" "jsonb" NOT NULL,
    "sources" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "longitudinal_clinical_summaries_records_count_check" CHECK (("records_count" >= 0)),
    CONSTRAINT "longitudinal_clinical_summaries_status_check" CHECK (("status" = ANY (ARRAY['ready'::"text", 'partial'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."longitudinal_clinical_summaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medical_record_addenda" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "medical_record_id" "uuid" NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "medical_record_addenda_content_check" CHECK ((TRIM(BOTH FROM "content") <> ''::"text")),
    CONSTRAINT "medical_record_addenda_reason_check" CHECK ((TRIM(BOTH FROM "reason") <> ''::"text"))
);


ALTER TABLE "public"."medical_record_addenda" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medical_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "chief_complaint" "text",
    "hpi" "text",
    "pmh" "text",
    "medications" "text",
    "allergies" "text",
    "family_history" "text",
    "social_history" "text",
    "physical_exam" "text",
    "assessment" "text",
    "cid10" "text",
    "plan" "text",
    "prescription" "text",
    "exam_requests" "text",
    "certificate" "text",
    "return_guidance" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "status" "public"."medical_record_status" DEFAULT 'draft'::"public"."medical_record_status" NOT NULL,
    "finalized_at" timestamp with time zone,
    "finalized_by" "uuid",
    "last_saved_at" timestamp with time zone,
    "vital_signs" "text",
    "guidance" "text",
    "prescription_draft" "jsonb",
    "autosave_version" bigint DEFAULT 0 NOT NULL,
    "draft_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "medical_records_prescription_draft_shape_check" CHECK ((("prescription_draft" IS NULL) OR (("jsonb_typeof"("prescription_draft") = 'object'::"text") AND ("jsonb_typeof"(("prescription_draft" -> 'medications'::"text")) = 'array'::"text") AND ("jsonb_array_length"(("prescription_draft" -> 'medications'::"text")) <= 100))))
);


ALTER TABLE "public"."medical_records" OWNER TO "postgres";


COMMENT ON COLUMN "public"."medical_records"."prescription_draft" IS 'Rascunho clínico estruturado e editável enquanto o atendimento e o prontuário estiverem abertos. Não representa documento oficial emitido.';



CREATE TABLE IF NOT EXISTS "public"."medication_catalog" (
    "source_key" "text" NOT NULL,
    "source" "text" DEFAULT 'ANVISA_DADOS_ABERTOS'::"text" NOT NULL,
    "product_type" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "active_ingredient" "text",
    "therapeutic_class" "text",
    "regulatory_category" "text",
    "registration_number" "text",
    "process_number" "text",
    "registration_holder" "text",
    "registration_status" "text" NOT NULL,
    "registration_expires" "text",
    "source_import_id" "uuid" NOT NULL,
    "source_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."medication_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_catalog_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_updated_at" timestamp with time zone,
    "checksum_sha256" "text" NOT NULL,
    "status" "text" NOT NULL,
    "imported_rows" integer DEFAULT 0 NOT NULL,
    "active_rows" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "medication_catalog_imports_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."medication_catalog_imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_clinical_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid",
    "actor_id" "uuid",
    "event_type" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."medication_clinical_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_clinical_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_key" "text" NOT NULL,
    "version" integer NOT NULL,
    "presentation_id" "text",
    "pharmaceutical_form_pattern" "text",
    "status" "public"."medication_clinical_status" DEFAULT 'draft'::"public"."medication_clinical_status" NOT NULL,
    "source_id" "uuid",
    "supersedes_id" "uuid",
    "change_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "suspended_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "medication_clinical_profiles_check" CHECK ((("presentation_id" IS NOT NULL) OR ("pharmaceutical_form_pattern" IS NOT NULL))),
    CONSTRAINT "medication_clinical_profiles_check1" CHECK ((("status" <> ALL (ARRAY['reviewed'::"public"."medication_clinical_status", 'approved'::"public"."medication_clinical_status"])) OR (("source_id" IS NOT NULL) AND ("reviewed_by" IS NOT NULL) AND ("reviewed_at" IS NOT NULL)))),
    CONSTRAINT "medication_clinical_profiles_check2" CHECK ((("status" <> 'approved'::"public"."medication_clinical_status") OR (("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL)))),
    CONSTRAINT "medication_clinical_profiles_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."medication_clinical_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_clinical_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "title" "text",
    "organization" "text",
    "version" "text",
    "publication_year" integer,
    "reference_url" "text",
    "accessed_at" "date",
    "technical_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."medication_clinical_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_dosage_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "template_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "version" integer NOT NULL,
    "status" "public"."medication_clinical_status" DEFAULT 'draft'::"public"."medication_clinical_status" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "route_code" "text",
    "dose_amount" numeric,
    "dose_unit_code" "text",
    "frequency_code" "text",
    "duration_code" "text",
    "instructions" "text",
    "population_context" "text",
    "supersedes_id" "uuid",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "medication_dosage_templates_check" CHECK ((("status" <> ALL (ARRAY['reviewed'::"public"."medication_clinical_status", 'approved'::"public"."medication_clinical_status"])) OR (("reviewed_by" IS NOT NULL) AND ("reviewed_at" IS NOT NULL)))),
    CONSTRAINT "medication_dosage_templates_check1" CHECK ((("status" <> 'approved'::"public"."medication_clinical_status") OR (("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL)))),
    CONSTRAINT "medication_dosage_templates_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."medication_dosage_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_dose_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "singular_label" "text" NOT NULL,
    "plural_label" "text" NOT NULL,
    "allows_fraction" boolean DEFAULT false NOT NULL,
    "measurable" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."medication_dose_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_duration_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "short_label" "text" NOT NULL,
    "prescription_text" "text" NOT NULL,
    "duration_days" integer,
    "option_type" "text" NOT NULL,
    "status" "public"."medication_clinical_status" DEFAULT 'approved'::"public"."medication_clinical_status" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "medication_duration_options_duration_days_check" CHECK ((("duration_days" IS NULL) OR ("duration_days" > 0))),
    CONSTRAINT "medication_duration_options_option_type_check" CHECK (("option_type" = ANY (ARRAY['exact'::"text", 'single_dose'::"text", 'continuous'::"text", 'conditional'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."medication_duration_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_frequency_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "short_label" "text" NOT NULL,
    "prescription_text" "text" NOT NULL,
    "administrations_per_day" numeric,
    "interval_hours" numeric,
    "option_type" "text" NOT NULL,
    "status" "public"."medication_clinical_status" DEFAULT 'approved'::"public"."medication_clinical_status" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "medication_frequency_options_option_type_check" CHECK (("option_type" = ANY (ARRAY['exact'::"text", 'conditional'::"text", 'continuous'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."medication_frequency_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_guidance_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "guidance_text" "text" NOT NULL,
    "status" "public"."medication_clinical_status" DEFAULT 'draft'::"public"."medication_clinical_status" NOT NULL,
    "source_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "medication_guidance_templates_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."medication_guidance_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_presentation_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" DEFAULT 'ANVISA_CMED'::"text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_published_at" timestamp with time zone,
    "checksum_sha256" "text" NOT NULL,
    "status" "text" NOT NULL,
    "imported_rows" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "medication_presentation_imports_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."medication_presentation_imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_presentations" (
    "source_import_id" "uuid" NOT NULL,
    "ggrem_code" "text" NOT NULL,
    "registration_number" "text",
    "product_registration_number" "text",
    "ean" "text",
    "substance" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "manufacturer" "text" NOT NULL,
    "presentation" "text" NOT NULL,
    "concentration" "text",
    "pharmaceutical_form" "text",
    "package_description" "text",
    "therapeutic_class" "text",
    "product_type" "text",
    "price_regime" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."medication_presentations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medication_route_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."medication_route_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "cpf" "text",
    "cns" "text",
    "birth_date" "date",
    "gender" "text",
    "marital_status" "text",
    "occupation" "text",
    "zip_code" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "phone" "text",
    "whatsapp" "text",
    "email" "text",
    "insurance" "text",
    "insurance_card" "text",
    "emergency_contact" "text",
    "allergies" "text",
    "comorbidities" "text",
    "notes" "text",
    "photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "address_complement" "text",
    "social_name" "text",
    "rg" "text",
    "race_ethnicity" "text",
    "nationality" "text",
    "birthplace" "text",
    "mother_name" "text",
    "father_name" "text",
    "address_number" "text",
    "neighborhood" "text",
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text",
    "emergency_contact_relationship" "text",
    "blood_type" "text",
    "continuous_medications" "text",
    "medical_history" "text",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "patients_cpf_length" CHECK ((("cpf" IS NULL) OR ("length"("regexp_replace"("cpf", '\\D'::"text", ''::"text", 'g'::"text")) = 11)))
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescription_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "medication_name" "text" NOT NULL,
    "concentration" "text",
    "pharmaceutical_form" "text",
    "route" "text",
    "dosage" "text",
    "frequency" "text",
    "duration" "text",
    "quantity" "text",
    "instructions" "text",
    "controlled" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."prescription_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professional_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "professional_name" "text",
    "profession" "text",
    "council" "text",
    "council_number" "text",
    "council_state" "text",
    "specialty" "text",
    "rqe" "text",
    "phone" "text",
    "email" "text",
    "signature_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sub_specialty" "text",
    "photo_url" "text",
    "stamp_url" "text",
    "is_responsible" boolean DEFAULT false NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."professional_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "role" "public"."user_role" DEFAULT 'receptionist'::"public"."user_role" NOT NULL,
    "avatar_url" "text",
    "active_clinic_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "professional_council" "text",
    "professional_registration" "text",
    "specialty" "text",
    "rqe" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_settings" (
    "clinic_id" "uuid" NOT NULL,
    "default_duration" integer DEFAULT 30 NOT NULL,
    "interval_between" integer DEFAULT 0 NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "lunch_start" time without time zone,
    "lunch_end" time without time zone,
    "service_days" "jsonb" DEFAULT '[1, 2, 3, 4, 5]'::"jsonb" NOT NULL,
    "allow_fit_in" boolean DEFAULT true NOT NULL,
    "minimum_notice" integer DEFAULT 0 NOT NULL,
    "maximum_advance" integer DEFAULT 90 NOT NULL,
    "holidays" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "blocked_periods" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."schedule_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."clinical_documents" ALTER COLUMN "public_number" SET DEFAULT "nextval"('"public"."clinical_document_public_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."ai_clinical_generations"
    ADD CONSTRAINT "ai_clinical_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_prescription_generations"
    ADD CONSTRAINT "ai_prescription_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("clinic_id");



ALTER TABLE "public"."appointments"
    ADD CONSTRAINT "appointments_cancellation_reason_required" CHECK ((("status" <> 'cancelled'::"public"."appointment_status_v1") OR (("cancellation_reason" IS NOT NULL) AND (TRIM(BOTH FROM "cancellation_reason") <> ''::"text")))) NOT VALID;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."appointments"
    ADD CONSTRAINT "appointments_required_fields" CHECK ((("clinic_id" IS NOT NULL) AND ("patient_id" IS NOT NULL) AND ("professional_id" IS NOT NULL) AND ("title" IS NOT NULL) AND ("appointment_date" IS NOT NULL) AND ("start_time" IS NOT NULL) AND ("end_time" IS NOT NULL) AND ("created_by" IS NOT NULL))) NOT VALID;



ALTER TABLE "public"."appointments"
    ADD CONSTRAINT "appointments_valid_time" CHECK (("end_time" > "start_time")) NOT VALID;



ALTER TABLE ONLY "public"."care_continuity_events"
    ADD CONSTRAINT "care_continuity_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_clinic_id_appointment_id_source_key_key" UNIQUE ("clinic_id", "appointment_id", "source_key");



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_audit_logs"
    ADD CONSTRAINT "clinic_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_invites"
    ADD CONSTRAINT "clinic_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_members"
    ADD CONSTRAINT "clinic_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_pkey" PRIMARY KEY ("clinic_id");



ALTER TABLE ONLY "public"."clinical_document_audit_events"
    ADD CONSTRAINT "clinical_document_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinical_document_template_favorites"
    ADD CONSTRAINT "clinical_document_template_favorites_pkey" PRIMARY KEY ("clinic_id", "user_id", "template_id");



ALTER TABLE ONLY "public"."clinical_document_templates"
    ADD CONSTRAINT "clinical_document_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinical_transcription_events"
    ADD CONSTRAINT "clinical_transcription_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultation_finalization_events"
    ADD CONSTRAINT "consultation_finalization_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_settings"
    ADD CONSTRAINT "document_settings_pkey" PRIMARY KEY ("clinic_id");



ALTER TABLE ONLY "public"."favorite_prescriptions"
    ADD CONSTRAINT "favorite_prescriptions_clinic_id_professional_id_name_key" UNIQUE ("clinic_id", "professional_id", "name");



ALTER TABLE ONLY "public"."favorite_prescriptions"
    ADD CONSTRAINT "favorite_prescriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."longitudinal_clinical_summaries"
    ADD CONSTRAINT "longitudinal_clinical_summaries_clinic_id_patient_id_key" UNIQUE ("clinic_id", "patient_id");



ALTER TABLE ONLY "public"."longitudinal_clinical_summaries"
    ADD CONSTRAINT "longitudinal_clinical_summaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medical_record_addenda"
    ADD CONSTRAINT "medical_record_addenda_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medical_records"
    ADD CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_catalog_imports"
    ADD CONSTRAINT "medication_catalog_imports_checksum_sha256_key" UNIQUE ("checksum_sha256");



ALTER TABLE ONLY "public"."medication_catalog_imports"
    ADD CONSTRAINT "medication_catalog_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_catalog"
    ADD CONSTRAINT "medication_catalog_pkey" PRIMARY KEY ("source_import_id", "source_key");



ALTER TABLE ONLY "public"."medication_clinical_audit_events"
    ADD CONSTRAINT "medication_clinical_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_clinical_profiles"
    ADD CONSTRAINT "medication_clinical_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_clinical_profiles"
    ADD CONSTRAINT "medication_clinical_profiles_profile_key_version_key" UNIQUE ("profile_key", "version");



ALTER TABLE ONLY "public"."medication_clinical_sources"
    ADD CONSTRAINT "medication_clinical_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_dosage_templates"
    ADD CONSTRAINT "medication_dosage_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_dosage_templates"
    ADD CONSTRAINT "medication_dosage_templates_template_key_version_key" UNIQUE ("template_key", "version");



ALTER TABLE ONLY "public"."medication_dose_units"
    ADD CONSTRAINT "medication_dose_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_dose_units"
    ADD CONSTRAINT "medication_dose_units_profile_id_code_key" UNIQUE ("profile_id", "code");



ALTER TABLE ONLY "public"."medication_duration_options"
    ADD CONSTRAINT "medication_duration_options_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."medication_duration_options"
    ADD CONSTRAINT "medication_duration_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_frequency_options"
    ADD CONSTRAINT "medication_frequency_options_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."medication_frequency_options"
    ADD CONSTRAINT "medication_frequency_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_guidance_templates"
    ADD CONSTRAINT "medication_guidance_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_guidance_templates"
    ADD CONSTRAINT "medication_guidance_templates_profile_id_code_version_key" UNIQUE ("profile_id", "code", "version");



ALTER TABLE ONLY "public"."medication_presentation_imports"
    ADD CONSTRAINT "medication_presentation_imports_checksum_sha256_key" UNIQUE ("checksum_sha256");



ALTER TABLE ONLY "public"."medication_presentation_imports"
    ADD CONSTRAINT "medication_presentation_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_presentations"
    ADD CONSTRAINT "medication_presentations_pkey" PRIMARY KEY ("source_import_id", "ggrem_code");



ALTER TABLE ONLY "public"."medication_route_options"
    ADD CONSTRAINT "medication_route_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medication_route_options"
    ADD CONSTRAINT "medication_route_options_profile_id_code_key" UNIQUE ("profile_id", "code");



ALTER TABLE "public"."patients"
    ADD CONSTRAINT "patients_clinic_id_required" CHECK (("clinic_id" IS NOT NULL)) NOT VALID;



ALTER TABLE "public"."patients"
    ADD CONSTRAINT "patients_created_by_required" CHECK (("created_by" IS NOT NULL)) NOT VALID;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_profiles"
    ADD CONSTRAINT "professional_profiles_clinic_id_user_id_key" UNIQUE ("clinic_id", "user_id");



ALTER TABLE ONLY "public"."professional_profiles"
    ADD CONSTRAINT "professional_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_settings"
    ADD CONSTRAINT "schedule_settings_pkey" PRIMARY KEY ("clinic_id");



CREATE INDEX "ai_clinical_generations_clinic_appointment_idx" ON "public"."ai_clinical_generations" USING "btree" ("clinic_id", "appointment_id", "created_at" DESC);



CREATE INDEX "ai_prescription_generations_appointment_idx" ON "public"."ai_prescription_generations" USING "btree" ("clinic_id", "appointment_id", "generated_at" DESC);



CREATE INDEX "appointments_clinic_date_idx" ON "public"."appointments" USING "btree" ("clinic_id", "appointment_date", "start_time");



CREATE INDEX "appointments_open_consultation_idx" ON "public"."appointments" USING "btree" ("clinic_id", "professional_id", "status", "consultation_last_activity");



CREATE INDEX "appointments_patient_idx" ON "public"."appointments" USING "btree" ("clinic_id", "patient_id", "appointment_date");



CREATE INDEX "appointments_professional_schedule_idx" ON "public"."appointments" USING "btree" ("clinic_id", "professional_id", "appointment_date", "start_time", "end_time");



CREATE INDEX "appointments_reception_queue_idx" ON "public"."appointments" USING "btree" ("clinic_id", "appointment_date", "status", "waiting_since");



CREATE INDEX "appointments_status_idx" ON "public"."appointments" USING "btree" ("clinic_id", "status", "appointment_date");



CREATE INDEX "care_continuity_assigned_idx" ON "public"."care_continuity_items" USING "btree" ("clinic_id", "assigned_to", "status");



CREATE INDEX "care_continuity_clinic_status_due_idx" ON "public"."care_continuity_items" USING "btree" ("clinic_id", "status", "due_at");



CREATE INDEX "care_continuity_events_item_idx" ON "public"."care_continuity_events" USING "btree" ("continuity_item_id", "created_at" DESC);



CREATE INDEX "care_continuity_patient_idx" ON "public"."care_continuity_items" USING "btree" ("clinic_id", "patient_id", "created_at" DESC);



CREATE INDEX "clinic_invites_clinic_status_idx" ON "public"."clinic_invites" USING "btree" ("clinic_id", "status", "created_at" DESC);



CREATE UNIQUE INDEX "clinic_invites_pending_email_idx" ON "public"."clinic_invites" USING "btree" ("clinic_id", "lower"("email")) WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "clinic_invites_token_idx" ON "public"."clinic_invites" USING "btree" ("token");



CREATE INDEX "clinic_members_clinic_idx" ON "public"."clinic_members" USING "btree" ("clinic_id", "status");



CREATE INDEX "clinic_members_clinic_status_idx" ON "public"."clinic_members" USING "btree" ("clinic_id", "status");



CREATE UNIQUE INDEX "clinic_members_clinic_user_unique_idx" ON "public"."clinic_members" USING "btree" ("clinic_id", "user_id");



CREATE INDEX "clinic_members_user_idx" ON "public"."clinic_members" USING "btree" ("user_id", "status");



CREATE INDEX "clinic_members_user_status_idx" ON "public"."clinic_members" USING "btree" ("user_id", "status");



CREATE INDEX "clinical_document_audit_events_clinic_idx" ON "public"."clinical_document_audit_events" USING "btree" ("clinic_id", "created_at" DESC);



CREATE INDEX "clinical_document_audit_events_document_idx" ON "public"."clinical_document_audit_events" USING "btree" ("document_id", "created_at" DESC);



CREATE INDEX "clinical_documents_active_clinic_appointment_idx" ON "public"."clinical_documents" USING "btree" ("clinic_id", "appointment_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "clinical_documents_active_clinic_patient_idx" ON "public"."clinical_documents" USING "btree" ("clinic_id", "patient_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "clinical_documents_appointment_idx" ON "public"."clinical_documents" USING "btree" ("appointment_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "clinical_documents_clinic_patient_idx" ON "public"."clinical_documents" USING "btree" ("clinic_id", "patient_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "clinical_documents_prescription_idempotency_uidx" ON "public"."clinical_documents" USING "btree" ("clinic_id", (("content" ->> 'idempotency_key'::"text"))) WHERE (("document_type" = ANY (ARRAY['prescription'::"public"."clinical_document_type", 'special_prescription'::"public"."clinical_document_type"])) AND (("content" ->> 'idempotency_key'::"text") IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "clinical_documents_public_number_uidx" ON "public"."clinical_documents" USING "btree" ("public_number");



CREATE INDEX "clinical_documents_record_idx" ON "public"."clinical_documents" USING "btree" ("medical_record_id") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "clinical_documents_superseded_by_uidx" ON "public"."clinical_documents" USING "btree" ("superseded_by_document_id") WHERE ("superseded_by_document_id" IS NOT NULL);



CREATE INDEX "clinical_documents_supersedes_idx" ON "public"."clinical_documents" USING "btree" ("supersedes_document_id") WHERE ("supersedes_document_id" IS NOT NULL);



CREATE INDEX "clinical_transcription_events_appointment_idx" ON "public"."clinical_transcription_events" USING "btree" ("clinic_id", "appointment_id", "created_at" DESC);



CREATE INDEX "clinics_name_idx" ON "public"."clinics" USING "btree" ("name");



CREATE INDEX "consultation_finalization_events_idx" ON "public"."consultation_finalization_events" USING "btree" ("clinic_id", "appointment_id", "created_at" DESC);



CREATE UNIQUE INDEX "consultation_finalization_once_idx" ON "public"."consultation_finalization_events" USING "btree" ("appointment_id", "event_type") WHERE ("event_type" = 'finalized'::"text");



CREATE INDEX "longitudinal_summaries_clinic_patient_idx" ON "public"."longitudinal_clinical_summaries" USING "btree" ("clinic_id", "patient_id");



CREATE INDEX "medical_record_addenda_record_idx" ON "public"."medical_record_addenda" USING "btree" ("medical_record_id", "created_at");



CREATE UNIQUE INDEX "medical_records_active_appointment_uidx" ON "public"."medical_records" USING "btree" ("appointment_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "medical_records_clinic_created_idx" ON "public"."medical_records" USING "btree" ("clinic_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "medical_records_clinic_patient_idx" ON "public"."medical_records" USING "btree" ("clinic_id", "patient_id", "created_at" DESC);



CREATE INDEX "medical_records_clinic_professional_idx" ON "public"."medical_records" USING "btree" ("clinic_id", "professional_id", "created_at" DESC);



CREATE INDEX "medication_catalog_active_idx" ON "public"."medication_catalog" USING "btree" ("product_name") WHERE ("registration_status" = 'Ativo'::"text");



CREATE INDEX "medication_catalog_active_ingredient_trgm_idx" ON "public"."medication_catalog" USING "gin" ("lower"(COALESCE("active_ingredient", ''::"text")) "extensions"."gin_trgm_ops");



CREATE INDEX "medication_catalog_product_name_trgm_idx" ON "public"."medication_catalog" USING "gin" ("lower"("product_name") "extensions"."gin_trgm_ops");



CREATE INDEX "medication_catalog_registration_idx" ON "public"."medication_catalog" USING "btree" ("registration_number");



CREATE INDEX "medication_catalog_therapeutic_class_trgm_idx" ON "public"."medication_catalog" USING "gin" ("lower"(COALESCE("therapeutic_class", ''::"text")) "extensions"."gin_trgm_ops");



CREATE INDEX "medication_clinical_audit_events_clinic_idx" ON "public"."medication_clinical_audit_events" USING "btree" ("clinic_id", "created_at" DESC);



CREATE INDEX "medication_clinical_profiles_form_idx" ON "public"."medication_clinical_profiles" USING "btree" ("pharmaceutical_form_pattern", "status");



CREATE INDEX "medication_clinical_profiles_presentation_idx" ON "public"."medication_clinical_profiles" USING "btree" ("presentation_id", "status");



CREATE INDEX "medication_dosage_templates_profile_idx" ON "public"."medication_dosage_templates" USING "btree" ("profile_id", "status");



CREATE INDEX "medication_presentations_product_trgm_idx" ON "public"."medication_presentations" USING "gin" ("lower"("product_name") "extensions"."gin_trgm_ops");



CREATE INDEX "medication_presentations_registration_idx" ON "public"."medication_presentations" USING "btree" ("product_registration_number");



CREATE INDEX "medication_presentations_substance_trgm_idx" ON "public"."medication_presentations" USING "gin" ("lower"("substance") "extensions"."gin_trgm_ops");



CREATE INDEX "patients_active_clinic_cpf_idx" ON "public"."patients" USING "btree" ("clinic_id", "cpf") WHERE ("deleted_at" IS NULL);



CREATE INDEX "patients_active_clinic_name_idx" ON "public"."patients" USING "btree" ("clinic_id", "full_name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "patients_active_clinic_social_name_idx" ON "public"."patients" USING "btree" ("clinic_id", "social_name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "patients_clinic_cpf_idx" ON "public"."patients" USING "btree" ("clinic_id", "cpf");



CREATE INDEX "patients_clinic_deleted_at_idx" ON "public"."patients" USING "btree" ("clinic_id", "deleted_at");



CREATE INDEX "patients_clinic_idx" ON "public"."patients" USING "btree" ("clinic_id", "full_name");



CREATE INDEX "patients_cpf_idx" ON "public"."patients" USING "btree" ("user_id", "cpf");



CREATE INDEX "patients_created_by_idx" ON "public"."patients" USING "btree" ("created_by");



CREATE INDEX "patients_full_name_idx" ON "public"."patients" USING "btree" ("user_id", "full_name");



CREATE INDEX "patients_user_id_idx" ON "public"."patients" USING "btree" ("user_id");



CREATE INDEX "prescription_items_clinic_document_idx" ON "public"."prescription_items" USING "btree" ("clinic_id", "document_id", "sort_order");



CREATE INDEX "prescription_items_document_idx" ON "public"."prescription_items" USING "btree" ("document_id", "sort_order");



CREATE INDEX "professional_profiles_clinic_active_idx" ON "public"."professional_profiles" USING "btree" ("clinic_id", "is_active");



CREATE INDEX "professional_profiles_clinic_idx" ON "public"."professional_profiles" USING "btree" ("clinic_id", "is_active");



CREATE UNIQUE INDEX "professional_profiles_clinic_user_uidx" ON "public"."professional_profiles" USING "btree" ("clinic_id", "user_id");



CREATE INDEX "profiles_active_clinic_idx" ON "public"."profiles" USING "btree" ("active_clinic_id");



CREATE OR REPLACE TRIGGER "appointments_enforce_tenant_and_conflict" BEFORE INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_appointment_tenant_and_conflict"();



CREATE OR REPLACE TRIGGER "appointments_finish_consultation_session" BEFORE UPDATE OF "status" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."finish_consultation_session"();



CREATE OR REPLACE TRIGGER "care_continuity_audit" AFTER INSERT OR UPDATE ON "public"."care_continuity_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_care_continuity_change"();



CREATE OR REPLACE TRIGGER "clinic_invites_set_updated_at" BEFORE UPDATE ON "public"."clinic_invites" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "clinic_members_set_updated_at" BEFORE UPDATE ON "public"."clinic_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "clinical_documents_audit_center_event" AFTER INSERT OR UPDATE ON "public"."clinical_documents" FOR EACH ROW EXECUTE FUNCTION "public"."audit_clinical_document_center_event"();



CREATE OR REPLACE TRIGGER "clinical_documents_capture_physician_review" BEFORE UPDATE OF "status" ON "public"."clinical_documents" FOR EACH ROW EXECUTE FUNCTION "public"."capture_clinical_document_physician_review"();



CREATE OR REPLACE TRIGGER "clinical_documents_enforce_tenant" BEFORE INSERT OR UPDATE ON "public"."clinical_documents" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_clinical_document_tenant"();



CREATE OR REPLACE TRIGGER "clinical_documents_track_draft_version" BEFORE UPDATE ON "public"."clinical_documents" FOR EACH ROW EXECUTE FUNCTION "public"."track_clinical_document_draft_version"();



CREATE OR REPLACE TRIGGER "clinics_set_updated_at" BEFORE UPDATE ON "public"."clinics" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "medical_record_addenda_mark_appointment" AFTER INSERT ON "public"."medical_record_addenda" FOR EACH ROW EXECUTE FUNCTION "public"."mark_appointment_has_addendum"();



CREATE OR REPLACE TRIGGER "medical_records_enforce_tenant" BEFORE INSERT OR UPDATE ON "public"."medical_records" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_medical_record_tenant"();



CREATE OR REPLACE TRIGGER "medical_records_protect_finalized" BEFORE UPDATE ON "public"."medical_records" FOR EACH ROW EXECUTE FUNCTION "public"."protect_finalized_medical_record"();



CREATE OR REPLACE TRIGGER "patients_enforce_tenant" BEFORE INSERT OR UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_patient_tenant"();



CREATE OR REPLACE TRIGGER "patients_set_updated_at" BEFORE UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "professional_profiles_enforce_tenant" BEFORE INSERT OR UPDATE ON "public"."professional_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_professional_profile_tenant"();



CREATE OR REPLACE TRIGGER "protect_clinic_membership_trigger" BEFORE DELETE OR UPDATE ON "public"."clinic_members" FOR EACH ROW EXECUTE FUNCTION "public"."protect_clinic_membership"();



CREATE OR REPLACE TRIGGER "settings_set_updated_at" BEFORE UPDATE ON "public"."ai_settings" FOR EACH ROW EXECUTE FUNCTION "public"."settings_set_updated_at"();



CREATE OR REPLACE TRIGGER "settings_set_updated_at" BEFORE UPDATE ON "public"."clinic_settings" FOR EACH ROW EXECUTE FUNCTION "public"."settings_set_updated_at"();



CREATE OR REPLACE TRIGGER "settings_set_updated_at" BEFORE UPDATE ON "public"."document_settings" FOR EACH ROW EXECUTE FUNCTION "public"."settings_set_updated_at"();



CREATE OR REPLACE TRIGGER "settings_set_updated_at" BEFORE UPDATE ON "public"."schedule_settings" FOR EACH ROW EXECUTE FUNCTION "public"."settings_set_updated_at"();



CREATE OR REPLACE TRIGGER "settings_touch_entity" BEFORE UPDATE ON "public"."clinic_members" FOR EACH ROW EXECUTE FUNCTION "public"."settings_touch_entity"();



CREATE OR REPLACE TRIGGER "settings_touch_entity" BEFORE UPDATE ON "public"."clinics" FOR EACH ROW EXECUTE FUNCTION "public"."settings_touch_entity"();



CREATE OR REPLACE TRIGGER "settings_touch_entity" BEFORE UPDATE ON "public"."professional_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."settings_touch_entity"();



CREATE OR REPLACE TRIGGER "settings_touch_entity" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."settings_touch_entity"();



ALTER TABLE ONLY "public"."ai_clinical_generations"
    ADD CONSTRAINT "ai_clinical_generations_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_clinical_generations"
    ADD CONSTRAINT "ai_clinical_generations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_clinical_generations"
    ADD CONSTRAINT "ai_clinical_generations_medical_record_id_fkey" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_clinical_generations"
    ADD CONSTRAINT "ai_clinical_generations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_clinical_generations"
    ADD CONSTRAINT "ai_clinical_generations_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_prescription_generations"
    ADD CONSTRAINT "ai_prescription_generations_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_prescription_generations"
    ADD CONSTRAINT "ai_prescription_generations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_prescription_generations"
    ADD CONSTRAINT "ai_prescription_generations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_prescription_generations"
    ADD CONSTRAINT "ai_prescription_generations_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_attendance_started_by_fkey" FOREIGN KEY ("attendance_started_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_consultation_locked_by_fkey" FOREIGN KEY ("consultation_locked_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."care_continuity_events"
    ADD CONSTRAINT "care_continuity_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."care_continuity_events"
    ADD CONSTRAINT "care_continuity_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."care_continuity_events"
    ADD CONSTRAINT "care_continuity_events_continuity_item_id_fkey" FOREIGN KEY ("continuity_item_id") REFERENCES "public"."care_continuity_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_clinical_document_id_fkey" FOREIGN KEY ("clinical_document_id") REFERENCES "public"."clinical_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."care_continuity_items"
    ADD CONSTRAINT "care_continuity_items_scheduled_appointment_id_fkey" FOREIGN KEY ("scheduled_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinic_audit_logs"
    ADD CONSTRAINT "clinic_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinic_audit_logs"
    ADD CONSTRAINT "clinic_audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_audit_logs"
    ADD CONSTRAINT "clinic_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinic_invites"
    ADD CONSTRAINT "clinic_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinic_invites"
    ADD CONSTRAINT "clinic_invites_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinic_invites"
    ADD CONSTRAINT "clinic_invites_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_invites"
    ADD CONSTRAINT "clinic_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinic_members"
    ADD CONSTRAINT "clinic_members_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE NOT VALID;



ALTER TABLE ONLY "public"."clinic_members"
    ADD CONSTRAINT "clinic_members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL NOT VALID;



ALTER TABLE ONLY "public"."clinic_members"
    ADD CONSTRAINT "clinic_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE NOT VALID;



ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_settings"
    ADD CONSTRAINT "clinic_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinical_document_audit_events"
    ADD CONSTRAINT "clinical_document_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinical_document_audit_events"
    ADD CONSTRAINT "clinical_document_audit_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_document_audit_events"
    ADD CONSTRAINT "clinical_document_audit_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."clinical_documents"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_document_template_favorites"
    ADD CONSTRAINT "clinical_document_template_favorites_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_document_template_favorites"
    ADD CONSTRAINT "clinical_document_template_favorites_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."clinical_document_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_document_template_favorites"
    ADD CONSTRAINT "clinical_document_template_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_document_templates"
    ADD CONSTRAINT "clinical_document_templates_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_document_templates"
    ADD CONSTRAINT "clinical_document_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_medical_record_id_fkey" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_records"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_superseded_by_document_id_fkey" FOREIGN KEY ("superseded_by_document_id") REFERENCES "public"."clinical_documents"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_documents"
    ADD CONSTRAINT "clinical_documents_supersedes_document_id_fkey" FOREIGN KEY ("supersedes_document_id") REFERENCES "public"."clinical_documents"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_transcription_events"
    ADD CONSTRAINT "clinical_transcription_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_transcription_events"
    ADD CONSTRAINT "clinical_transcription_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clinical_transcription_events"
    ADD CONSTRAINT "clinical_transcription_events_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."consultation_finalization_events"
    ADD CONSTRAINT "consultation_finalization_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultation_finalization_events"
    ADD CONSTRAINT "consultation_finalization_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."consultation_finalization_events"
    ADD CONSTRAINT "consultation_finalization_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."consultation_finalization_events"
    ADD CONSTRAINT "consultation_finalization_events_medical_record_id_fkey" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_records"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."document_settings"
    ADD CONSTRAINT "document_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_settings"
    ADD CONSTRAINT "document_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."favorite_prescriptions"
    ADD CONSTRAINT "favorite_prescriptions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorite_prescriptions"
    ADD CONSTRAINT "favorite_prescriptions_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."longitudinal_clinical_summaries"
    ADD CONSTRAINT "longitudinal_clinical_summaries_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."longitudinal_clinical_summaries"
    ADD CONSTRAINT "longitudinal_clinical_summaries_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."longitudinal_clinical_summaries"
    ADD CONSTRAINT "longitudinal_clinical_summaries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medical_record_addenda"
    ADD CONSTRAINT "medical_record_addenda_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medical_record_addenda"
    ADD CONSTRAINT "medical_record_addenda_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medical_record_addenda"
    ADD CONSTRAINT "medical_record_addenda_medical_record_id_fkey" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_records"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medical_records"
    ADD CONSTRAINT "medical_records_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."medical_records"
    ADD CONSTRAINT "medical_records_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."medical_records"
    ADD CONSTRAINT "medical_records_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medical_records"
    ADD CONSTRAINT "medical_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."medical_records"
    ADD CONSTRAINT "medical_records_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."medication_catalog"
    ADD CONSTRAINT "medication_catalog_source_import_id_fkey" FOREIGN KEY ("source_import_id") REFERENCES "public"."medication_catalog_imports"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_clinical_audit_events"
    ADD CONSTRAINT "medication_clinical_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_clinical_audit_events"
    ADD CONSTRAINT "medication_clinical_audit_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_clinical_profiles"
    ADD CONSTRAINT "medication_clinical_profiles_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_clinical_profiles"
    ADD CONSTRAINT "medication_clinical_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_clinical_profiles"
    ADD CONSTRAINT "medication_clinical_profiles_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_clinical_profiles"
    ADD CONSTRAINT "medication_clinical_profiles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."medication_clinical_sources"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_clinical_profiles"
    ADD CONSTRAINT "medication_clinical_profiles_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."medication_clinical_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_dosage_templates"
    ADD CONSTRAINT "medication_dosage_templates_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_dosage_templates"
    ADD CONSTRAINT "medication_dosage_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_dosage_templates"
    ADD CONSTRAINT "medication_dosage_templates_duration_code_fkey" FOREIGN KEY ("duration_code") REFERENCES "public"."medication_duration_options"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_dosage_templates"
    ADD CONSTRAINT "medication_dosage_templates_frequency_code_fkey" FOREIGN KEY ("frequency_code") REFERENCES "public"."medication_frequency_options"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_dosage_templates"
    ADD CONSTRAINT "medication_dosage_templates_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."medication_clinical_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_dosage_templates"
    ADD CONSTRAINT "medication_dosage_templates_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_dosage_templates"
    ADD CONSTRAINT "medication_dosage_templates_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."medication_clinical_sources"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_dosage_templates"
    ADD CONSTRAINT "medication_dosage_templates_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."medication_dosage_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_dose_units"
    ADD CONSTRAINT "medication_dose_units_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."medication_clinical_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_guidance_templates"
    ADD CONSTRAINT "medication_guidance_templates_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."medication_clinical_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_guidance_templates"
    ADD CONSTRAINT "medication_guidance_templates_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_guidance_templates"
    ADD CONSTRAINT "medication_guidance_templates_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."medication_clinical_sources"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_presentations"
    ADD CONSTRAINT "medication_presentations_source_import_id_fkey" FOREIGN KEY ("source_import_id") REFERENCES "public"."medication_presentation_imports"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."medication_route_options"
    ADD CONSTRAINT "medication_route_options_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."medication_clinical_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT NOT VALID;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."clinical_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_profiles"
    ADD CONSTRAINT "professional_profiles_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_profiles"
    ADD CONSTRAINT "professional_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."professional_profiles"
    ADD CONSTRAINT "professional_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_active_clinic_id_fkey" FOREIGN KEY ("active_clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_active_clinic_settings_fk" FOREIGN KEY ("active_clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL NOT VALID;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE NOT VALID;



ALTER TABLE ONLY "public"."schedule_settings"
    ADD CONSTRAINT "schedule_settings_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_settings"
    ADD CONSTRAINT "schedule_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



CREATE POLICY "AI prescription generations insert" ON "public"."ai_prescription_generations" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_medical_record_clinic"("clinic_id") AND ("professional_id" = "auth"."uid"())));



CREATE POLICY "AI prescription generations select" ON "public"."ai_prescription_generations" FOR SELECT TO "authenticated" USING ("public"."can_access_medical_record_clinic"("clinic_id"));



CREATE POLICY "AI prescription generations update" ON "public"."ai_prescription_generations" FOR UPDATE TO "authenticated" USING (("public"."can_access_medical_record_clinic"("clinic_id") AND ("professional_id" = "auth"."uid"()))) WITH CHECK (("public"."can_access_medical_record_clinic"("clinic_id") AND ("professional_id" = "auth"."uid"())));



CREATE POLICY "Active clinic members delete appointments" ON "public"."appointments" FOR DELETE TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Active clinic members delete patients" ON "public"."patients" FOR DELETE TO "authenticated" USING ("public"."can_access_patient_clinic"("clinic_id"));



CREATE POLICY "Active clinic members insert appointments" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_active_clinic_member"("clinic_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Active clinic members insert patients" ON "public"."patients" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_patient_clinic"("clinic_id") AND ("user_id" = "auth"."uid"()) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Active clinic members select appointments" ON "public"."appointments" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Active clinic members select medical records" ON "public"."medical_records" FOR SELECT TO "authenticated" USING (("public"."can_access_medical_record_clinic"("clinic_id") AND ("deleted_at" IS NULL)));



CREATE POLICY "Active clinic members select patients" ON "public"."patients" FOR SELECT TO "authenticated" USING ("public"."can_access_patient_clinic"("clinic_id"));



CREATE POLICY "Active clinic members update appointments" ON "public"."appointments" FOR UPDATE TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id")) WITH CHECK ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Active clinic members update patients" ON "public"."patients" FOR UPDATE TO "authenticated" USING ("public"."can_access_patient_clinic"("clinic_id")) WITH CHECK ("public"."can_access_patient_clinic"("clinic_id"));



CREATE POLICY "Assigned professionals insert medical records" ON "public"."medical_records" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_medical_record_clinic"("clinic_id") AND ("professional_id" = "auth"."uid"()) AND ("deleted_at" IS NULL)));



CREATE POLICY "Assigned professionals update medical records" ON "public"."medical_records" FOR UPDATE TO "authenticated" USING (("public"."can_access_medical_record_clinic"("clinic_id") AND ("professional_id" = "auth"."uid"()) AND ("deleted_at" IS NULL))) WITH CHECK (("public"."can_access_medical_record_clinic"("clinic_id") AND ("professional_id" = "auth"."uid"())));



CREATE POLICY "Authenticated users read active duration options" ON "public"."medication_duration_options" FOR SELECT TO "authenticated" USING (("status" = ANY (ARRAY['reviewed'::"public"."medication_clinical_status", 'approved'::"public"."medication_clinical_status"])));



CREATE POLICY "Authenticated users read active frequency options" ON "public"."medication_frequency_options" FOR SELECT TO "authenticated" USING (("status" = ANY (ARRAY['reviewed'::"public"."medication_clinical_status", 'approved'::"public"."medication_clinical_status"])));



CREATE POLICY "Authenticated users read approved clinical profiles" ON "public"."medication_clinical_profiles" FOR SELECT TO "authenticated" USING (("status" = ANY (ARRAY['reviewed'::"public"."medication_clinical_status", 'approved'::"public"."medication_clinical_status"])));



CREATE POLICY "Authenticated users read approved dosage templates" ON "public"."medication_dosage_templates" FOR SELECT TO "authenticated" USING (("status" = ANY (ARRAY['reviewed'::"public"."medication_clinical_status", 'approved'::"public"."medication_clinical_status"])));



CREATE POLICY "Authenticated users read approved dose units" ON "public"."medication_dose_units" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."medication_clinical_profiles" "profile"
  WHERE (("profile"."id" = "medication_dose_units"."profile_id") AND ("profile"."status" = ANY (ARRAY['reviewed'::"public"."medication_clinical_status", 'approved'::"public"."medication_clinical_status"]))))));



CREATE POLICY "Authenticated users read approved guidance templates" ON "public"."medication_guidance_templates" FOR SELECT TO "authenticated" USING (("status" = ANY (ARRAY['reviewed'::"public"."medication_clinical_status", 'approved'::"public"."medication_clinical_status"])));



CREATE POLICY "Authenticated users read approved route options" ON "public"."medication_route_options" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."medication_clinical_profiles" "profile"
  WHERE (("profile"."id" = "medication_route_options"."profile_id") AND ("profile"."status" = ANY (ARRAY['reviewed'::"public"."medication_clinical_status", 'approved'::"public"."medication_clinical_status"]))))));



CREATE POLICY "Authenticated users read clinical sources" ON "public"."medication_clinical_sources" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Clinic admins create medical record addenda" ON "public"."medical_record_addenda" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."clinic_members"
  WHERE (("clinic_members"."clinic_id" = "medical_record_addenda"."clinic_id") AND ("clinic_members"."user_id" = "auth"."uid"()) AND ("clinic_members"."status" = 'active'::"public"."clinic_member_status") AND ("clinic_members"."role" = 'clinic_admin'::"public"."clinic_member_role"))))));



CREATE POLICY "Clinic admins manage professional profiles" ON "public"."professional_profiles" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"())) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"()));



CREATE POLICY "Clinic admins read active clinic invites" ON "public"."clinic_invites" FOR SELECT TO "authenticated" USING (("clinic_id" = "public"."current_clinic_admin_id"()));



CREATE POLICY "Clinic admins read active clinic members" ON "public"."clinic_members" FOR SELECT TO "authenticated" USING (("clinic_id" = "public"."current_clinic_admin_id"()));



CREATE POLICY "Clinic doctors manage document templates" ON "public"."clinical_document_templates" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND ("created_by" = "auth"."uid"()))) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Clinic isolation for appointments" ON "public"."appointments" TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id")) WITH CHECK ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Clinic isolation for patients" ON "public"."patients" TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id")) WITH CHECK ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Clinic members read continuity events" ON "public"."care_continuity_events" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Clinic members read continuity items" ON "public"."care_continuity_items" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Clinic members read document audit" ON "public"."clinical_document_audit_events" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Clinic members read document templates" ON "public"."clinical_document_templates" FOR SELECT TO "authenticated" USING ((("clinic_id" IS NULL) OR "public"."is_active_clinic_member"("clinic_id")));



CREATE POLICY "Clinic members read finalization events" ON "public"."consultation_finalization_events" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Clinic members view clinical documents" ON "public"."clinical_documents" FOR SELECT TO "authenticated" USING (("public"."is_active_clinic_member"("clinic_id") AND ("deleted_at" IS NULL)));



CREATE POLICY "Clinic members view medical record addenda" ON "public"."medical_record_addenda" FOR SELECT TO "authenticated" USING ("public"."can_access_medical_record_clinic"("clinic_id"));



CREATE POLICY "Clinic members view prescription items" ON "public"."prescription_items" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Clinic members view professional profiles" ON "public"."professional_profiles" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Clinical AI generations insert" ON "public"."ai_clinical_generations" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_medical_record_clinic"("clinic_id") AND ("professional_id" = "auth"."uid"())));



CREATE POLICY "Clinical AI generations select" ON "public"."ai_clinical_generations" FOR SELECT TO "authenticated" USING ("public"."can_access_medical_record_clinic"("clinic_id"));



CREATE POLICY "Clinical AI generations update" ON "public"."ai_clinical_generations" FOR UPDATE TO "authenticated" USING (("public"."can_access_medical_record_clinic"("clinic_id") AND ("professional_id" = "auth"."uid"()))) WITH CHECK (("public"."can_access_medical_record_clinic"("clinic_id") AND ("professional_id" = "auth"."uid"())));



CREATE POLICY "Clinical transcription events insert" ON "public"."clinical_transcription_events" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_medical_record_clinic"("clinic_id") AND ("requested_by" = "auth"."uid"())));



CREATE POLICY "Clinical transcription events select" ON "public"."clinical_transcription_events" FOR SELECT TO "authenticated" USING ("public"."can_access_medical_record_clinic"("clinic_id"));



CREATE POLICY "Create clinic" ON "public"."clinics" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Doctors manage continuity items" ON "public"."care_continuity_items" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."clinic_members" "member"
  WHERE (("member"."clinic_id" = "care_continuity_items"."clinic_id") AND ("member"."user_id" = "auth"."uid"()) AND ("member"."status" = 'active'::"public"."clinic_member_status") AND ("member"."role" = ANY (ARRAY['doctor'::"public"."clinic_member_role", 'clinic_admin'::"public"."clinic_member_role"]))))))) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."clinic_members" "member"
  WHERE (("member"."clinic_id" = "care_continuity_items"."clinic_id") AND ("member"."user_id" = "auth"."uid"()) AND ("member"."status" = 'active'::"public"."clinic_member_status") AND ("member"."role" = ANY (ARRAY['doctor'::"public"."clinic_member_role", 'clinic_admin'::"public"."clinic_member_role"])))))));



CREATE POLICY "Hotfix members read clinics" ON "public"."clinics" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clinic_members" "cm"
  WHERE (("cm"."clinic_id" = "clinics"."id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."status" = 'active'::"public"."clinic_member_status")))));



CREATE POLICY "Hotfix users read own memberships" ON "public"."clinic_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Hotfix users read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Invitees read own pending invites" ON "public"."clinic_invites" FOR SELECT TO "authenticated" USING ((("lower"("email") = "lower"(COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text"))) AND ("status" = 'pending'::"text") AND ("expires_at" > "now"())));



CREATE POLICY "Longitudinal summaries insert" ON "public"."longitudinal_clinical_summaries" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_medical_record_clinic"("clinic_id") AND ("generated_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."patients" "patient"
  WHERE (("patient"."id" = "longitudinal_clinical_summaries"."patient_id") AND ("patient"."clinic_id" = "patient"."clinic_id"))))));



CREATE POLICY "Longitudinal summaries select" ON "public"."longitudinal_clinical_summaries" FOR SELECT TO "authenticated" USING ("public"."can_access_medical_record_clinic"("clinic_id"));



CREATE POLICY "Longitudinal summaries update" ON "public"."longitudinal_clinical_summaries" FOR UPDATE TO "authenticated" USING ("public"."can_access_medical_record_clinic"("clinic_id")) WITH CHECK (("public"."can_access_medical_record_clinic"("clinic_id") AND ("generated_by" = "auth"."uid"())));



CREATE POLICY "Manage active clinic" ON "public"."clinics" FOR UPDATE TO "authenticated" USING ((("id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"())) WITH CHECK ((("id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"()));



CREATE POLICY "Members read own membership" ON "public"."clinic_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Professionals create clinical documents" ON "public"."clinical_documents" FOR INSERT TO "authenticated" WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND ("created_by" = "auth"."uid"()) AND ("professional_id" = "auth"."uid"())));



CREATE POLICY "Professionals manage draft prescription items" ON "public"."prescription_items" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."clinical_documents" "doc"
  WHERE (("doc"."id" = "prescription_items"."document_id") AND ("doc"."clinic_id" = "doc"."clinic_id") AND ("doc"."status" = 'draft'::"public"."clinical_document_status") AND ("doc"."professional_id" = "auth"."uid"())))))) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."clinical_documents" "doc"
  WHERE (("doc"."id" = "prescription_items"."document_id") AND ("doc"."clinic_id" = "doc"."clinic_id") AND ("doc"."status" = 'draft'::"public"."clinical_document_status") AND ("doc"."professional_id" = "auth"."uid"()))))));



CREATE POLICY "Professionals manage own favorites" ON "public"."favorite_prescriptions" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND ("professional_id" = "auth"."uid"()))) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND ("professional_id" = "auth"."uid"())));



CREATE POLICY "Professionals update draft documents" ON "public"."clinical_documents" FOR UPDATE TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND ("professional_id" = "auth"."uid"()) AND ("status" = 'draft'::"public"."clinical_document_status"))) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND ("professional_id" = "auth"."uid"()) AND ("status" = 'draft'::"public"."clinical_document_status")));



CREATE POLICY "Professionals update own professional profile" ON "public"."professional_profiles" FOR UPDATE TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND ("user_id" = "auth"."uid"()))) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Read active clinic audit" ON "public"."clinic_audit_logs" FOR SELECT TO "authenticated" USING (((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"()) OR "public"."is_platform_admin"()));



CREATE POLICY "Read member clinics" ON "public"."clinics" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."clinic_members" "cm"
  WHERE (("cm"."clinic_id" = "clinics"."id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."status" = 'active'::"public"."clinic_member_status"))))));



CREATE POLICY "Settings active admins write" ON "public"."ai_settings" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"())) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"()));



CREATE POLICY "Settings active admins write" ON "public"."clinic_settings" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"())) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"()));



CREATE POLICY "Settings active admins write" ON "public"."document_settings" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"())) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"()));



CREATE POLICY "Settings active admins write" ON "public"."schedule_settings" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"())) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"()));



CREATE POLICY "Settings active members read" ON "public"."ai_settings" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Settings active members read" ON "public"."clinic_settings" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Settings active members read" ON "public"."document_settings" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Settings active members read" ON "public"."schedule_settings" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Settings admins manage professionals" ON "public"."professional_profiles" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"())) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"()));



CREATE POLICY "Settings admins update clinics" ON "public"."clinics" FOR UPDATE TO "authenticated" USING ((("id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"())) WITH CHECK ((("id" = "public"."active_clinic_id"()) AND "public"."is_active_clinic_admin"()));



CREATE POLICY "Settings members read active memberships" ON "public"."clinic_members" FOR SELECT TO "authenticated" USING (("clinic_id" = "public"."active_clinic_id"()));



CREATE POLICY "Settings members read clinics" ON "public"."clinics" FOR SELECT TO "authenticated" USING (("id" = "public"."active_clinic_id"()));



CREATE POLICY "Settings members read professionals" ON "public"."professional_profiles" FOR SELECT TO "authenticated" USING ("public"."is_active_clinic_member"("clinic_id"));



CREATE POLICY "Settings professionals insert own profile" ON "public"."professional_profiles" FOR INSERT TO "authenticated" WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Settings professionals update own profile" ON "public"."professional_profiles" FOR UPDATE TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND ("user_id" = "auth"."uid"()))) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Settings users read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Settings users update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users manage document template favorites" ON "public"."clinical_document_template_favorites" TO "authenticated" USING ((("clinic_id" = "public"."active_clinic_id"()) AND ("user_id" = "auth"."uid"()))) WITH CHECK ((("clinic_id" = "public"."active_clinic_id"()) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users update their own profile except active clinic" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK ((("id" = "auth"."uid"()) AND (NOT ("active_clinic_id" IS DISTINCT FROM ( SELECT "profiles_1"."active_clinic_id"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."ai_clinical_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_prescription_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."care_continuity_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."care_continuity_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinic_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinic_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinic_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinic_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_document_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_document_template_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_document_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_transcription_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consultation_finalization_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favorite_prescriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."longitudinal_clinical_summaries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medical_record_addenda" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medical_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_catalog_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_clinical_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_clinical_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_clinical_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_dosage_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_dose_units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_duration_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_frequency_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_guidance_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_presentation_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_presentations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medication_route_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prescription_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professional_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_settings" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































































































































GRANT ALL ON FUNCTION "public"."accept_my_clinic_invite"("invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_my_clinic_invite"("invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_my_clinic_invite"("invite_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_my_clinic_invites"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_my_clinic_invites"() TO "anon";
GRANT ALL ON FUNCTION "public"."accept_my_clinic_invites"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_my_clinic_invites"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."active_clinic_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."active_clinic_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."active_clinic_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."active_clinic_id"() TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."advance_reception_appointment"("target_appointment_id" "uuid", "target_status" "public"."appointment_status_v1", "reception_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."advance_reception_appointment"("target_appointment_id" "uuid", "target_status" "public"."appointment_status_v1", "reception_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."advance_reception_appointment"("target_appointment_id" "uuid", "target_status" "public"."appointment_status_v1", "reception_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_reception_appointment"("target_appointment_id" "uuid", "target_status" "public"."appointment_status_v1", "reception_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_care_continuity_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_care_continuity_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_care_continuity_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_clinical_document_center_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_clinical_document_center_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_clinical_document_center_event"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."autosave_consultation_draft"("target_appointment_id" "uuid", "lock_token" "uuid", "draft" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."autosave_consultation_draft"("target_appointment_id" "uuid", "lock_token" "uuid", "draft" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."autosave_consultation_draft"("target_appointment_id" "uuid", "lock_token" "uuid", "draft" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."autosave_consultation_draft"("target_appointment_id" "uuid", "lock_token" "uuid", "draft" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_medical_record_clinic"("target_clinic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_medical_record_clinic"("target_clinic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_medical_record_clinic"("target_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_medical_record_clinic"("target_clinic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_patient_clinic"("target_clinic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_patient_clinic"("target_clinic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_patient_clinic"("target_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_patient_clinic"("target_clinic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_clinical_document"("target_document_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_clinical_document"("target_document_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_clinical_document"("target_document_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_clinical_document"("target_document_id" "uuid", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."canonical_jsonb_sha256"("value" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."canonical_jsonb_sha256"("value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."canonical_jsonb_sha256"("value" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_clinical_document_physician_review"() TO "anon";
GRANT ALL ON FUNCTION "public"."capture_clinical_document_physician_review"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_clinical_document_physician_review"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clinic_asset_clinic_id"("object_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."clinic_asset_clinic_id"("object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clinic_asset_clinic_id"("object_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."clinical_document_asset_clinic_id"("object_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."clinical_document_asset_clinic_id"("object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clinical_document_asset_clinic_id"("object_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."clinical_document_asset_document_id"("object_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."clinical_document_asset_document_id"("object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clinical_document_asset_document_id"("object_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_professional_invite_onboarding"("invite_id" "uuid", "profile_data" "jsonb", "terms_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_professional_invite_onboarding"("invite_id" "uuid", "profile_data" "jsonb", "terms_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_professional_invite_onboarding"("invite_id" "uuid", "profile_data" "jsonb", "terms_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_professional_invite_onboarding"("invite_id" "uuid", "profile_data" "jsonb", "terms_version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_clinic_for_current_user"("clinic_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_clinic_for_current_user"("clinic_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_clinic_for_current_user"("clinic_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_clinic_invite"("invite_email" "text", "invite_full_name" "text", "invite_role" "text", "invite_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_clinic_invite"("invite_email" "text", "invite_full_name" "text", "invite_role" "text", "invite_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_clinic_invite"("invite_email" "text", "invite_full_name" "text", "invite_role" "text", "invite_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_clinic_with_owner"("clinic_name" "text", "clinic_legal_name" "text", "clinic_cnpj" "text", "clinic_email" "text", "clinic_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_clinic_with_owner"("clinic_name" "text", "clinic_legal_name" "text", "clinic_cnpj" "text", "clinic_email" "text", "clinic_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_clinic_with_owner"("clinic_name" "text", "clinic_legal_name" "text", "clinic_cnpj" "text", "clinic_email" "text", "clinic_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_clinic_with_owner"("clinic_name" "text", "clinic_legal_name" "text", "clinic_cnpj" "text", "clinic_email" "text", "clinic_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_encounter_continuity_items"("target_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_encounter_continuity_items"("target_appointment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_encounter_continuity_items"("target_appointment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_encounter_continuity_items"("target_appointment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_medical_record_addendum"("target_record_id" "uuid", "addendum_content" "text", "addendum_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_medical_record_addendum"("target_record_id" "uuid", "addendum_content" "text", "addendum_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_medical_record_addendum"("target_record_id" "uuid", "addendum_content" "text", "addendum_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_medical_record_addendum"("target_record_id" "uuid", "addendum_content" "text", "addendum_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_clinic_admin_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_clinic_admin_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_clinic_admin_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_clinic_admin_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_appointment_tenant_and_conflict"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_appointment_tenant_and_conflict"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_appointment_tenant_and_conflict"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_clinical_document_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_clinical_document_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_clinical_document_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_medical_record_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_medical_record_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_medical_record_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_patient_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_patient_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_patient_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_professional_profile_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_professional_profile_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_professional_profile_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."escape_official_document_html"("value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."escape_official_document_html"("value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."escape_official_document_html"("value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_clinical_encounter"("target_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_clinical_encounter"("target_appointment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_clinical_encounter"("target_appointment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_clinical_encounter"("target_appointment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_clinical_encounter_safe"("target_appointment_id" "uuid", "lock_token" "uuid", "expected_autosave_version" bigint, "acknowledge_alerts" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_clinical_encounter_safe"("target_appointment_id" "uuid", "lock_token" "uuid", "expected_autosave_version" bigint, "acknowledge_alerts" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_clinical_encounter_safe"("target_appointment_id" "uuid", "lock_token" "uuid", "expected_autosave_version" bigint, "acknowledge_alerts" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_clinical_encounter_safe"("target_appointment_id" "uuid", "lock_token" "uuid", "expected_autosave_version" bigint, "acknowledge_alerts" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."finish_consultation_session"() TO "anon";
GRANT ALL ON FUNCTION "public"."finish_consultation_session"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."finish_consultation_session"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_clinic_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_clinic_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_clinic_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_clinic_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_clinic_member"("target_clinic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_clinic_member"("target_clinic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_clinic_member"("target_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_clinic_member"("target_clinic_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_clinical_document"("target_document_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_clinical_document"("target_document_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_clinical_document"("target_document_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_clinical_document"("target_document_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_prescription_document_atomic"("target_appointment_id" "uuid", "medical_record_payload" "jsonb", "prescription_snapshot" "jsonb", "idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_prescription_document_atomic"("target_appointment_id" "uuid", "medical_record_payload" "jsonb", "prescription_snapshot" "jsonb", "idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_prescription_document_atomic"("target_appointment_id" "uuid", "medical_record_payload" "jsonb", "prescription_snapshot" "jsonb", "idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_prescription_document_atomic"("target_appointment_id" "uuid", "medical_record_payload" "jsonb", "prescription_snapshot" "jsonb", "idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_active_clinic_team"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_active_clinic_team"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_active_clinic_team"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_active_clinic_team"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_appointment_has_addendum"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_appointment_has_addendum"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_appointment_has_addendum"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_clinical_document_printed"("target_document_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_clinical_document_printed"("target_document_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_clinical_document_printed"("target_document_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_clinical_document_printed"("target_document_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."open_or_resume_consultation"("target_appointment_id" "uuid", "lock_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_or_resume_consultation"("target_appointment_id" "uuid", "lock_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."open_or_resume_consultation"("target_appointment_id" "uuid", "lock_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_or_resume_consultation"("target_appointment_id" "uuid", "lock_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_clinic_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_clinic_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_clinic_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_finalized_medical_record"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_finalized_medical_record"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_finalized_medical_record"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_clinic_invite_delivery"("invite_id" "uuid", "delivery_succeeded" boolean, "delivery_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_clinic_invite_delivery"("invite_id" "uuid", "delivery_succeeded" boolean, "delivery_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_clinic_invite_delivery"("invite_id" "uuid", "delivery_succeeded" boolean, "delivery_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_clinic_invite_delivery"("invite_id" "uuid", "delivery_succeeded" boolean, "delivery_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_clinical_document_access"("target_document_id" "uuid", "access_event" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_clinical_document_access"("target_document_id" "uuid", "access_event" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_clinical_document_access"("target_document_id" "uuid", "access_event" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_clinical_document_access"("target_document_id" "uuid", "access_event" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_consultation_finalization_failure"("target_appointment_id" "uuid", "failure_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_consultation_finalization_failure"("target_appointment_id" "uuid", "failure_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_consultation_finalization_failure"("target_appointment_id" "uuid", "failure_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_consultation_finalization_failure"("target_appointment_id" "uuid", "failure_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_active_clinic_member"("member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_active_clinic_member"("member_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_active_clinic_member"("member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_active_clinic_member"("member_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."render_official_prescription_html"("snapshot" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."render_official_prescription_html"("snapshot" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."render_official_prescription_html"("snapshot" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."renew_active_clinic_invite"("invite_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."renew_active_clinic_invite"("invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."renew_active_clinic_invite"("invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."renew_active_clinic_invite"("invite_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."renew_consultation_lock"("target_appointment_id" "uuid", "lock_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."renew_consultation_lock"("target_appointment_id" "uuid", "lock_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."renew_consultation_lock"("target_appointment_id" "uuid", "lock_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."renew_consultation_lock"("target_appointment_id" "uuid", "lock_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_active_clinic_invite"("invite_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_active_clinic_invite"("invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_active_clinic_invite"("invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_active_clinic_invite"("invite_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_medication_catalog"("search_term" "text", "result_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_medication_catalog"("search_term" "text", "result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_medication_catalog"("search_term" "text", "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_medication_catalog"("search_term" "text", "result_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_active_clinic"("target_clinic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_active_clinic"("target_clinic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_active_clinic"("target_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_clinic"("target_clinic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_clinical_document_pdf_result"("target_document_id" "uuid", "storage_path" "text", "generation_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_clinical_document_pdf_result"("target_document_id" "uuid", "storage_path" "text", "generation_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_clinical_document_pdf_result"("target_document_id" "uuid", "storage_path" "text", "generation_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_clinical_document_pdf_result"("target_document_id" "uuid", "storage_path" "text", "generation_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."settings_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."settings_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."settings_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."settings_touch_entity"() TO "anon";
GRANT ALL ON FUNCTION "public"."settings_touch_entity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."settings_touch_entity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_clinical_encounter"("target_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_clinical_encounter"("target_appointment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."start_clinical_encounter"("target_appointment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_clinical_encounter"("target_appointment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."supersede_clinical_document"("previous_document_id" "uuid", "replacement_document_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."supersede_clinical_document"("previous_document_id" "uuid", "replacement_document_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."supersede_clinical_document"("previous_document_id" "uuid", "replacement_document_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."supersede_clinical_document"("previous_document_id" "uuid", "replacement_document_id" "uuid", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."track_clinical_document_draft_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."track_clinical_document_draft_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_clinical_document_draft_version"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_active_clinic_member"("member_id" "uuid", "member_role" "text", "member_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_active_clinic_member"("member_id" "uuid", "member_role" "text", "member_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_active_clinic_member"("member_id" "uuid", "member_role" "text", "member_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_active_clinic_member"("member_id" "uuid", "member_role" "text", "member_status" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."ai_clinical_generations" TO "anon";
GRANT ALL ON TABLE "public"."ai_clinical_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_clinical_generations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_prescription_generations" TO "anon";
GRANT ALL ON TABLE "public"."ai_prescription_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_prescription_generations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_settings" TO "anon";
GRANT ALL ON TABLE "public"."ai_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_settings" TO "service_role";



GRANT ALL ON TABLE "public"."care_continuity_events" TO "anon";
GRANT ALL ON TABLE "public"."care_continuity_events" TO "authenticated";
GRANT ALL ON TABLE "public"."care_continuity_events" TO "service_role";



GRANT ALL ON TABLE "public"."care_continuity_items" TO "anon";
GRANT ALL ON TABLE "public"."care_continuity_items" TO "authenticated";
GRANT ALL ON TABLE "public"."care_continuity_items" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."clinic_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_invites" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."clinic_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_invites" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_members" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."clinic_members" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_members" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_settings" TO "anon";
GRANT ALL ON TABLE "public"."clinic_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_settings" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_document_audit_events" TO "anon";
GRANT ALL ON TABLE "public"."clinical_document_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_document_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_documents" TO "anon";
GRANT ALL ON TABLE "public"."clinical_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clinical_document_public_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clinical_document_public_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clinical_document_public_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_document_template_favorites" TO "anon";
GRANT ALL ON TABLE "public"."clinical_document_template_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_document_template_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_document_templates" TO "anon";
GRANT ALL ON TABLE "public"."clinical_document_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_document_templates" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_transcription_events" TO "anon";
GRANT ALL ON TABLE "public"."clinical_transcription_events" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_transcription_events" TO "service_role";



GRANT ALL ON TABLE "public"."clinics" TO "anon";
GRANT ALL ON TABLE "public"."clinics" TO "authenticated";
GRANT ALL ON TABLE "public"."clinics" TO "service_role";



GRANT ALL ON TABLE "public"."consultation_finalization_events" TO "anon";
GRANT ALL ON TABLE "public"."consultation_finalization_events" TO "authenticated";
GRANT ALL ON TABLE "public"."consultation_finalization_events" TO "service_role";



GRANT ALL ON TABLE "public"."document_settings" TO "anon";
GRANT ALL ON TABLE "public"."document_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."document_settings" TO "service_role";



GRANT ALL ON TABLE "public"."favorite_prescriptions" TO "anon";
GRANT ALL ON TABLE "public"."favorite_prescriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."favorite_prescriptions" TO "service_role";



GRANT ALL ON TABLE "public"."longitudinal_clinical_summaries" TO "anon";
GRANT ALL ON TABLE "public"."longitudinal_clinical_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."longitudinal_clinical_summaries" TO "service_role";



GRANT ALL ON TABLE "public"."medical_record_addenda" TO "anon";
GRANT ALL ON TABLE "public"."medical_record_addenda" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_record_addenda" TO "service_role";



GRANT ALL ON TABLE "public"."medical_records" TO "anon";
GRANT ALL ON TABLE "public"."medical_records" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_records" TO "service_role";



GRANT ALL ON TABLE "public"."medication_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."medication_catalog_imports" TO "service_role";



GRANT ALL ON TABLE "public"."medication_clinical_audit_events" TO "anon";
GRANT ALL ON TABLE "public"."medication_clinical_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."medication_clinical_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."medication_clinical_profiles" TO "anon";
GRANT ALL ON TABLE "public"."medication_clinical_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."medication_clinical_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."medication_clinical_sources" TO "anon";
GRANT ALL ON TABLE "public"."medication_clinical_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."medication_clinical_sources" TO "service_role";



GRANT ALL ON TABLE "public"."medication_dosage_templates" TO "anon";
GRANT ALL ON TABLE "public"."medication_dosage_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."medication_dosage_templates" TO "service_role";



GRANT ALL ON TABLE "public"."medication_dose_units" TO "anon";
GRANT ALL ON TABLE "public"."medication_dose_units" TO "authenticated";
GRANT ALL ON TABLE "public"."medication_dose_units" TO "service_role";



GRANT ALL ON TABLE "public"."medication_duration_options" TO "anon";
GRANT ALL ON TABLE "public"."medication_duration_options" TO "authenticated";
GRANT ALL ON TABLE "public"."medication_duration_options" TO "service_role";



GRANT ALL ON TABLE "public"."medication_frequency_options" TO "anon";
GRANT ALL ON TABLE "public"."medication_frequency_options" TO "authenticated";
GRANT ALL ON TABLE "public"."medication_frequency_options" TO "service_role";



GRANT ALL ON TABLE "public"."medication_guidance_templates" TO "anon";
GRANT ALL ON TABLE "public"."medication_guidance_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."medication_guidance_templates" TO "service_role";



GRANT ALL ON TABLE "public"."medication_presentation_imports" TO "service_role";



GRANT ALL ON TABLE "public"."medication_presentations" TO "service_role";



GRANT ALL ON TABLE "public"."medication_route_options" TO "anon";
GRANT ALL ON TABLE "public"."medication_route_options" TO "authenticated";
GRANT ALL ON TABLE "public"."medication_route_options" TO "service_role";



GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT ALL ON TABLE "public"."prescription_items" TO "anon";
GRANT ALL ON TABLE "public"."prescription_items" TO "authenticated";
GRANT ALL ON TABLE "public"."prescription_items" TO "service_role";



GRANT ALL ON TABLE "public"."professional_profiles" TO "anon";
GRANT ALL ON TABLE "public"."professional_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."professional_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_settings" TO "anon";
GRANT ALL ON TABLE "public"."schedule_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_settings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































