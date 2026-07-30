-- ============================================================
-- 030: Enforce export eligibility rules
--
-- Rule: Only supplier_type IN ('exporter','exporter_manufacturer',
-- 'trader') may appear in importer_supplier_links. A pure
-- manufacturer or broker cannot export directly to a US importer —
-- they must flow through an exporter.
-- ============================================================

-- ── 1. Helper: is this supplier export-eligible? ─────────────

create or replace function public.is_export_eligible(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from suppliers
    where id = p_supplier_id
      and supplier_type in ('exporter', 'exporter_manufacturer', 'trader')
  );
$$;

-- ── 2. Trigger: block non-exporters from importer_supplier_links

create or replace function public.validate_exporter_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_export_eligible(new.supplier_id) then
    raise exception
      'Only exporters, traders, or exporter-manufacturers can be linked to importers. '
      'This supplier type (%) cannot export directly.',
      (select supplier_type from suppliers where id = new.supplier_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_exporter_link on importer_supplier_links;
create trigger trg_validate_exporter_link
  before insert or update on importer_supplier_links
  for each row execute function public.validate_exporter_link();

-- ── 3. Back-fill: ensure all existing importer_supplier_links point
--      to entities with an export-eligible type. Any that are NULL
--      or 'manufacturer' get updated to 'exporter' (safe assumption
--      for data already in the link table).

update suppliers
set supplier_type = 'exporter'
where id in (select supplier_id from importer_supplier_links)
  and (supplier_type is null or supplier_type not in ('exporter', 'exporter_manufacturer', 'trader'));

-- ── 4. Suppliers added via InviteSupplierForm (upstream suppliers)
--      default to 'manufacturer' — update the column default.

alter table suppliers
  alter column supplier_type set default 'manufacturer';

-- Re-assert the check constraint to include all valid values
alter table suppliers
  drop constraint if exists suppliers_supplier_type_check;

alter table suppliers
  add constraint suppliers_supplier_type_check
  check (supplier_type in (
    'exporter',
    'exporter_manufacturer',
    'manufacturer',
    'trader',
    'broker'
  ));
