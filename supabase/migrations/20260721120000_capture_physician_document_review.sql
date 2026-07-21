begin;

-- A document becomes physician-reviewed only in the same statement that moves
-- it into an official state. Draft saves, previews and autosaves never pass
-- through this branch. The lifecycle guard continues to reject direct status
-- changes; the checks below additionally bind the review to the responsible
-- authenticated professional and to an active membership in the same clinic.
create or replace function public.capture_clinical_document_physician_review()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
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

drop trigger if exists clinical_documents_capture_physician_review on public.clinical_documents;
create trigger clinical_documents_capture_physician_review
before update of status on public.clinical_documents
for each row execute function public.capture_clinical_document_physician_review();

commit;
select pg_notify('pgrst', 'reload schema');
