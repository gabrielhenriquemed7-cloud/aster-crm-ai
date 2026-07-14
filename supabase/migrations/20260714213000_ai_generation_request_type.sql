begin;

alter table public.ai_clinical_generations
  add column if not exists request_type text;

alter table public.ai_clinical_generations
  drop constraint if exists ai_clinical_generations_request_type_check;

alter table public.ai_clinical_generations
  add constraint ai_clinical_generations_request_type_check
  check (
    request_type is null
    or request_type in (
      'structured_anamnesis',
      'soap',
      'hypotheses',
      'cid10',
      'exams',
      'conduct'
    )
  );

commit;

select pg_notify('pgrst', 'reload schema');
