-- ============================================================================
-- 031_importer_product_ownership.sql — an importer sees its own product
-- records, not every product of an exporter it shares with other importers
--
-- products_read (004) let an importer read any product whose supplier it is
-- linked to. Exporters are shared: ThrushCross, Vegan Meats and Nutty Cathy
-- all buy from Andes Ingredients and Pacific Valley Foods, so Vegan Meats'
-- product list showed ThrushCross's Mango Puree, Cocoa Nibs and the rest —
-- another importer's FSVP work, including which foods it imports.
--
-- A product record belongs to one importer (products_verify.importer_id), or to
-- nobody yet when an exporter created it before any importer took it on. The
-- linked-exporter clause now admits only those two: "filed for me, or for
-- nobody in particular" — the rule documents already follow, and the one
-- lib/products/ownership.ts applies to the pages that read through the admin
-- client, which bypasses this policy.
--
-- Every other clause is unchanged: platform staff, the importer's own records
-- (importer_id), the exporter's own products, and linked-supplier access on the
-- exporter side.
-- ============================================================================

begin;

drop policy if exists products_read on products_verify;
create policy products_read on products_verify
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or (
      importer_id is null
      and supplier_id in (
        select supplier_id from supplier_relationships
        where relationship_type = 'importer_supplier'
          and importer_id in (select public.current_importer_ids())
      )
    )
    or public.is_linked_supplier(supplier_id)
  );

commit;
