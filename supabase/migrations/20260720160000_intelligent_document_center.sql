alter type public.clinical_document_type add value if not exists 'medical_report';
alter type public.clinical_document_type add value if not exists 'clinical_summary';
alter type public.clinical_document_type add value if not exists 'printable_evolution';

commit;
begin;

alter table public.clinical_documents
  add column if not exists generated_by_ai boolean not null default false,
  add column if not exists reviewed_by_physician boolean not null default false,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete restrict,
  add column if not exists signed_at timestamptz,
  add column if not exists signature_provider text,
  add column if not exists signature_metadata jsonb not null default '{}'::jsonb;

update public.clinical_documents
set reviewed_by_physician = true,
    reviewed_at = coalesce(reviewed_at, issued_at, immutable_at, updated_at),
    reviewed_by = coalesce(reviewed_by, issued_by, professional_id)
where status in ('finalized', 'signed', 'archived') and not reviewed_by_physician;

alter table public.clinical_documents
  drop constraint if exists clinical_documents_physician_review_required,
  add constraint clinical_documents_physician_review_required
  check (status not in ('finalized', 'signed', 'archived') or reviewed_by_physician) not valid;
alter table public.clinical_documents validate constraint clinical_documents_physician_review_required;

create table if not exists public.clinical_document_templates (
  id text primary key,
  clinic_id uuid references public.clinics(id) on delete cascade,
  document_type public.clinical_document_type not null,
  name text not null check (trim(name) <> ''),
  title text not null check (trim(title) <> ''),
  content jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinical_document_template_favorites (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id text not null references public.clinical_document_templates(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id, template_id)
);

insert into public.clinical_document_templates(id, document_type, name, title, content)
values
  ('attendance-certificate', 'attendance_declaration', 'Atestado de Comparecimento', 'Declaração de comparecimento', '{"body":"Declaro, para os devidos fins, que o(a) paciente compareceu a esta instituição para atendimento médico na data informada."}'),
  ('medical-certificate', 'medical_certificate', 'Atestado Médico', 'Atestado médico', '{"body":"Atesto, para os devidos fins, que o(a) paciente necessita de afastamento de suas atividades pelo período definido após revisão médica."}'),
  ('cbc-request', 'exam_request', 'Solicitação de Hemograma', 'Solicitação de hemograma', '{"body":"Solicito hemograma completo.\n\nIndicação clínica: preencher após avaliação médica."}'),
  ('cardiology-request', 'exam_request', 'Solicitação Cardiologia', 'Solicitação cardiológica', '{"body":"Solicito avaliação/exames cardiológicos conforme indicação clínica registrada."}'),
  ('orthopedics-referral', 'referral', 'Encaminhamento Ortopedia', 'Encaminhamento para Ortopedia', '{"body":"Encaminho o(a) paciente para avaliação ortopédica.\n\nMotivo e achados relevantes: preencher."}'),
  ('simple-declaration', 'attendance_declaration', 'Declaração simples', 'Declaração', '{"body":"Declaro, para os devidos fins, as informações revisadas abaixo."}'),
  ('medical-report', 'medical_report', 'Relatório Médico', 'Relatório médico', '{"body":"RELATÓRIO MÉDICO\n\nHistórico clínico:\n\nAvaliação:\n\nConduta e acompanhamento:"}')
on conflict (id) do nothing;

alter table public.clinical_document_templates enable row level security;
alter table public.clinical_document_template_favorites enable row level security;
drop policy if exists "Clinic members read document templates" on public.clinical_document_templates;
drop policy if exists "Clinic doctors manage document templates" on public.clinical_document_templates;
drop policy if exists "Users manage document template favorites" on public.clinical_document_template_favorites;
create policy "Clinic members read document templates" on public.clinical_document_templates for select to authenticated
using (clinic_id is null or public.is_active_clinic_member(clinic_id));
create policy "Clinic doctors manage document templates" on public.clinical_document_templates for all to authenticated
using (clinic_id = public.active_clinic_id() and created_by = auth.uid())
with check (clinic_id = public.active_clinic_id() and created_by = auth.uid());
create policy "Users manage document template favorites" on public.clinical_document_template_favorites for all to authenticated
using (clinic_id = public.active_clinic_id() and user_id = auth.uid())
with check (clinic_id = public.active_clinic_id() and user_id = auth.uid());

grant select, insert, update, delete on public.clinical_document_templates to authenticated;
grant select, insert, update, delete on public.clinical_document_template_favorites to authenticated;

create or replace function public.track_clinical_document_draft_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'draft' and (new.title is distinct from old.title or new.content is distinct from old.content) then
    new.document_version := coalesce(old.document_version, 1) + 1;
  end if;
  return new;
end $$;

drop trigger if exists clinical_documents_track_draft_version on public.clinical_documents;
create trigger clinical_documents_track_draft_version before update on public.clinical_documents
for each row execute function public.track_clinical_document_draft_version();

create or replace function public.audit_clinical_document_center_event()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists clinical_documents_audit_center_event on public.clinical_documents;
create trigger clinical_documents_audit_center_event after insert or update on public.clinical_documents
for each row execute function public.audit_clinical_document_center_event();

commit;
select pg_notify('pgrst', 'reload schema');
