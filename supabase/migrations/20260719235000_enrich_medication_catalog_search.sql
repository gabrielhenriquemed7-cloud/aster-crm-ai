begin;

create extension if not exists unaccent with schema extensions;

drop function if exists public.search_medication_catalog(text, integer);
create function public.search_medication_catalog(
  search_term text,
  result_limit integer default 20
)
returns table (
  source_key text,
  presentation_id text,
  product_name text,
  active_ingredient text,
  concentration text,
  pharmaceutical_form text,
  presentation text,
  package_description text,
  therapeutic_class text,
  regulatory_category text,
  registration_number text,
  registration_holder text,
  regulatory_status text,
  manufacturer text,
  ean text,
  product_type text,
  source text,
  source_updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, extensions
as $$
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

revoke all on function public.search_medication_catalog(text, integer) from public;
grant execute on function public.search_medication_catalog(text, integer) to authenticated;

commit;
select pg_notify('pgrst', 'reload schema');
