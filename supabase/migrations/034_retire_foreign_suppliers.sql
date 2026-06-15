-- ============================================================
-- 034: Retire foreign_suppliers table
--
-- foreign_suppliers (migration 003) is a legacy importer-owned
-- supplier table that predates the shared `suppliers` table.
-- No TypeScript code references it. Migrate any surviving rows
-- into `suppliers` then drop the table.
-- ============================================================

-- ── 1. Migrate rows not already in suppliers ──────────────────

insert into suppliers (
  company_name,
  legal_entity_name,
  country,
  address_json,
  contact_json,
  approval_status,
  supplier_type,
  importer_id,
  created_at
)
select
  fs.supplier_name,
  fs.legal_name,
  fs.country,
  fs.address_json,
  jsonb_build_object(
    'name',  fs.contact_name,
    'email', fs.contact_email,
    'phone', fs.contact_phone
  ),
  case fs.approval_status
    when 'approved'   then 'approved'
    when 'suspended'  then 'suspended'
    when 'temporary'  then 'active'
    else 'pending_review'
  end,
  'manufacturer',
  fs.importer_id,
  fs.created_at
from foreign_suppliers fs
where not exists (
  select 1 from suppliers s
  where lower(s.company_name) = lower(fs.supplier_name)
    and s.importer_id = fs.importer_id
)
on conflict do nothing;

-- ── 2. Drop the table (cascades to supplier_facilities, supplier_products) ──

drop table if exists foreign_suppliers cascade;
