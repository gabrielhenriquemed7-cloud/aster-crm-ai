begin;

update public.medication_presentations
set pharmaceutical_form = case
  when presentation ~* '(^| )PO SUS OR( |$)' then 'Pó para suspensão oral'
  when presentation ~* '(^| )DRG( |$)' then 'Drágea'
  else pharmaceutical_form
end
where pharmaceutical_form is null
  and (
    presentation ~* '(^| )PO SUS OR( |$)'
    or presentation ~* '(^| )DRG( |$)'
  );

commit;
select pg_notify('pgrst', 'reload schema');
