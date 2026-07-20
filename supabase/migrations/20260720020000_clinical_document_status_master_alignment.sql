do $$
begin
  if exists (
    select 1 from pg_enum value
    join pg_type type on type.oid = value.enumtypid
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and type.typname = 'clinical_document_status'
      and value.enumlabel = 'issued'
  ) and not exists (
    select 1 from pg_enum value
    join pg_type type on type.oid = value.enumtypid
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and type.typname = 'clinical_document_status'
      and value.enumlabel = 'finalized'
  ) then
    alter type public.clinical_document_status rename value 'issued' to 'finalized';
  end if;
end
$$;

alter type public.clinical_document_status add value if not exists 'in_review' after 'draft';
alter type public.clinical_document_status add value if not exists 'signed' after 'finalized';
alter type public.clinical_document_status add value if not exists 'archived' after 'signed';
