begin;

alter table public.medical_records
  add column if not exists prescription_draft jsonb;

alter table public.medical_records
  drop constraint if exists medical_records_prescription_draft_shape_check,
  add constraint medical_records_prescription_draft_shape_check
    check (
      prescription_draft is null
      or (
        jsonb_typeof(prescription_draft) = 'object'
        and jsonb_typeof(prescription_draft -> 'medications') = 'array'
        and jsonb_array_length(prescription_draft -> 'medications') <= 100
      )
    );

comment on column public.medical_records.prescription_draft is
  'Rascunho clínico estruturado e editável enquanto o atendimento e o prontuário estiverem abertos. Não representa documento oficial emitido.';

commit;
select pg_notify('pgrst', 'reload schema');
