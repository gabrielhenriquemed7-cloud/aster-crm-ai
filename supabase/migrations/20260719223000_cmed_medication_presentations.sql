begin;

create table if not exists public.medication_presentation_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'ANVISA_CMED',
  source_url text not null,
  source_published_at timestamptz,
  checksum_sha256 text not null unique,
  status text not null check (status in ('processing', 'completed', 'failed')),
  imported_rows integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.medication_presentations (
  source_import_id uuid not null references public.medication_presentation_imports(id) on delete restrict,
  ggrem_code text not null,
  registration_number text,
  product_registration_number text,
  ean text,
  substance text not null,
  product_name text not null,
  manufacturer text not null,
  presentation text not null,
  concentration text,
  pharmaceutical_form text,
  package_description text,
  therapeutic_class text,
  product_type text,
  price_regime text,
  created_at timestamptz not null default now(),
  primary key (source_import_id, ggrem_code)
);

create index if not exists medication_presentations_product_trgm_idx
  on public.medication_presentations using gin (lower(product_name) extensions.gin_trgm_ops);
create index if not exists medication_presentations_substance_trgm_idx
  on public.medication_presentations using gin (lower(substance) extensions.gin_trgm_ops);
create index if not exists medication_presentations_registration_idx
  on public.medication_presentations(product_registration_number);

alter table public.medication_presentation_imports enable row level security;
alter table public.medication_presentations enable row level security;
revoke all on public.medication_presentation_imports from anon, authenticated;
revoke all on public.medication_presentations from anon, authenticated;

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
  therapeutic_class text,
  regulatory_category text,
  registration_number text,
  registration_holder text,
  manufacturer text,
  product_type text
)
language plpgsql
security definer
stable
set search_path = public, extensions
as $$
declare
  normalized_term text := trim(coalesce(search_term, ''));
  safe_limit integer := least(greatest(coalesce(result_limit, 20), 1), 30);
begin
  if auth.uid() is null or public.active_clinic_id() is null then
    raise exception using errcode = '42501', message = 'Sessão ou clínica ativa inválida.';
  end if;
  if length(normalized_term) < 2 then return; end if;

  return query
  with latest_presentations as (
    select presentations.*
    from public.medication_presentations presentations
    where presentations.source_import_id = (
      select imports.id
      from public.medication_presentation_imports imports
      where imports.status = 'completed'
      order by imports.completed_at desc
      limit 1
    )
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
    coalesce(catalog.source_key, presentation.ggrem_code) as source_key,
    presentation.ggrem_code as presentation_id,
    presentation.product_name,
    coalesce(catalog.active_ingredient, presentation.substance) as active_ingredient,
    presentation.concentration,
    presentation.pharmaceutical_form,
    presentation.presentation,
    coalesce(catalog.therapeutic_class, presentation.therapeutic_class) as therapeutic_class,
    catalog.regulatory_category,
    coalesce(catalog.registration_number, presentation.product_registration_number) as registration_number,
    catalog.registration_holder,
    presentation.manufacturer,
    presentation.product_type
  from latest_presentations presentation
  left join latest_catalog catalog
    on catalog.registration_number = presentation.product_registration_number
  where
    presentation.product_name ilike '%' || normalized_term || '%'
    or presentation.substance ilike '%' || normalized_term || '%'
    or presentation.presentation ilike '%' || normalized_term || '%'
    or coalesce(presentation.product_registration_number, '') = normalized_term
  order by
    case
      when lower(presentation.product_name) = lower(normalized_term) then 0
      when lower(presentation.substance) = lower(normalized_term) then 1
      when lower(presentation.product_name) like lower(normalized_term) || '%' then 2
      when lower(presentation.substance) like lower(normalized_term) || '%' then 3
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
