-- 039_products_facilities_profile_rls_reapply.sql — re-apply the RLS policies from
-- 019_product_facility_link.sql that never actually ran (same root cause as the
-- facility_id column being missing: migration 019 never executed against this database).
-- Without these, a supplier's own products/facilities are invisible to them under RLS —
-- only platform admins or importer_id matches could see rows, and supplier-created rows
-- have no importer_id.

drop policy if exists facilities_supplier_profile_write on facilities_verify;
create policy facilities_supplier_profile_write on facilities_verify
  for all to authenticated
  using (
    supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  )
  with check (
    supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  );

drop policy if exists products_supplier_profile_write on products_verify;
create policy products_supplier_profile_write on products_verify
  for all to authenticated
  using (
    supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  )
  with check (
    supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  );
