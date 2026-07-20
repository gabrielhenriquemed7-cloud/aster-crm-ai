begin;

alter table public.medical_records
  disable trigger medical_records_enforce_tenant;

with latest_official_prescription as (
  select distinct on (document.appointment_id)
    document.appointment_id,
    document.snapshot_json #> '{prescription,payload}' as payload
  from public.clinical_documents document
  where document.document_type in ('prescription', 'special_prescription')
    and document.status in ('finalized', 'signed', 'archived', 'cancelled')
    and document.deleted_at is null
    and jsonb_typeof(document.snapshot_json #> '{prescription,payload,medications}') = 'array'
  order by document.appointment_id, document.issued_at desc nulls last, document.created_at desc
)
update public.medical_records record
set
  prescription_draft = jsonb_build_object(
    'id', coalesce(source.payload ->> 'id', gen_random_uuid()::text),
    'type', coalesce(source.payload ->> 'type', 'simple'),
    'medications', source.payload -> 'medications',
    'orientations', coalesce(source.payload ->> 'orientations', ''),
    'observations', coalesce(source.payload ->> 'observations', '')
  ),
  updated_at = now()
from latest_official_prescription source
join public.appointments appointment
  on appointment.id = source.appointment_id
 and appointment.status = 'in_progress'
where record.appointment_id = source.appointment_id
  and record.status = 'draft'
  and record.deleted_at is null
  and record.prescription_draft is null;

alter table public.medical_records
  enable trigger medical_records_enforce_tenant;

commit;
select pg_notify('pgrst', 'reload schema');
