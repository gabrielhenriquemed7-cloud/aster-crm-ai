begin;

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.medication_catalog_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_url text not null,
  source_updated_at timestamptz,
  checksum_sha256 text not null unique,
  status text not null check (status in ('processing', 'completed', 'failed')),
  imported_rows integer not null default 0,
  active_rows integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.medication_catalog (
  source_key text not null,
  source text not null default 'ANVISA_DADOS_ABERTOS',
  product_type text not null,
  product_name text not null,
  active_ingredient text,
  therapeutic_class text,
  regulatory_category text,
  registration_number text,
  process_number text,
  registration_holder text,
  registration_status text not null,
  registration_expires text,
  source_import_id uuid not null references public.medication_catalog_imports(id) on delete restrict,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_import_id, source_key)
);

create index if not exists medication_catalog_product_name_trgm_idx
  on public.medication_catalog using gin (lower(product_name) extensions.gin_trgm_ops);
create index if not exists medication_catalog_active_ingredient_trgm_idx
  on public.medication_catalog using gin (lower(coalesce(active_ingredient, '')) extensions.gin_trgm_ops);
create index if not exists medication_catalog_therapeutic_class_trgm_idx
  on public.medication_catalog using gin (lower(coalesce(therapeutic_class, '')) extensions.gin_trgm_ops);
create index if not exists medication_catalog_registration_idx
  on public.medication_catalog(registration_number);
create index if not exists medication_catalog_active_idx
  on public.medication_catalog(product_name)
  where registration_status = 'Ativo';

alter table public.medication_catalog_imports enable row level security;
alter table public.medication_catalog enable row level security;

revoke all on public.medication_catalog_imports from anon, authenticated;
revoke all on public.medication_catalog from anon, authenticated;

create or replace function public.search_medication_catalog(
  search_term text,
  result_limit integer default 20
)
returns table (
  source_key text,
  product_name text,
  active_ingredient text,
  therapeutic_class text,
  regulatory_category text,
  registration_number text,
  registration_holder text
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
  if length(normalized_term) < 2 then
    return;
  end if;

  return query
  select
    catalog.source_key,
    catalog.product_name,
    catalog.active_ingredient,
    catalog.therapeutic_class,
    catalog.regulatory_category,
    catalog.registration_number,
    catalog.registration_holder
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
    and (
      catalog.product_name ilike '%' || normalized_term || '%'
      or coalesce(catalog.active_ingredient, '') ilike '%' || normalized_term || '%'
      or coalesce(catalog.therapeutic_class, '') ilike '%' || normalized_term || '%'
      or coalesce(catalog.registration_number, '') = normalized_term
    )
  order by
    case
      when lower(catalog.product_name) = lower(normalized_term) then 0
      when lower(catalog.product_name) like lower(normalized_term) || '%' then 1
      when lower(coalesce(catalog.active_ingredient, '')) like lower(normalized_term) || '%' then 2
      else 3
    end,
    similarity(lower(catalog.product_name), lower(normalized_term)) desc,
    catalog.product_name
  limit safe_limit;
end;
$$;

revoke all on function public.search_medication_catalog(text, integer) from public;
grant execute on function public.search_medication_catalog(text, integer) to authenticated;

commit;
select pg_notify('pgrst', 'reload schema');
