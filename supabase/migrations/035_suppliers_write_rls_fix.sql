-- ============================================================
-- 035: Fix suppliers_write RLS to allow exporters to INSERT
--      new upstream supplier rows.
--
-- The existing with check clause required the new row's id to
-- already be in profiles.supplier_id, which is impossible for
-- a brand-new INSERT. Exporters (supplier-role users with a
-- supplier_id set) must be able to create new suppliers rows
-- when linking upstream partners via /my-suppliers.
-- ============================================================

drop policy if exists suppliers_write on suppliers;

create policy suppliers_write on suppliers
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    -- Own record
    or id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    -- Any authenticated exporter/supplier can create new supplier rows
    -- (for upstream partner linking). The exporter_supplier_links row
    -- created immediately after constrains who can actually use the record.
    or exists (
      select 1 from profiles
      where id = auth.uid() and supplier_id is not null
    )
  );
