-- ============================================================
-- 029: Add legal_entity_name + fda_registration_number to profiles
--      so supplier users can enter them on the Account page and have
--      them sync to both profiles and the linked suppliers record.
-- ============================================================

alter table profiles
  add column if not exists legal_entity_name      text,
  add column if not exists fda_registration_number text;

-- ============================================================
-- Fix documents RLS so supplier-role users can always
--      insert their own evidence without requiring profiles.supplier_id
--      to be set first (breaks the bootstrap chicken-and-egg).
--
-- Also allows any supplier to insert a suppliers row for themselves
-- so the corporate page bootstrap works without the admin client.
-- ============================================================

-- ── 1. Documents: allow insert by profile identity ────────────
-- The existing supplier_documents_write_by_supplier policy requires
-- profiles.supplier_id to be non-null, which blocks uploads before
-- the bootstrap completes. Add a parallel policy that trusts the
-- uploaded_by_profile_id column instead.

drop policy if exists supplier_documents_write_by_profile on documents;

create policy supplier_documents_write_by_profile on documents
  for insert to authenticated
  with check (
    uploaded_by_profile_id = auth.uid()
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and role::text = 'supplier'
    )
  );

-- ── 2. Suppliers: allow a supplier-role user to self-insert ───
-- The suppliers_write with check requires either importer_id or an
-- existing profiles.supplier_id link, both of which are absent on
-- first insert. Add a narrow policy allowing the bootstrap insert.

drop policy if exists suppliers_self_bootstrap on suppliers;

create policy suppliers_self_bootstrap on suppliers
  for insert to authenticated
  with check (
    -- Only supplier-role users, and only when they have no supplier
    -- record linked yet (prevents creating extras after bootstrap)
    exists (
      select 1 from profiles
      where id = auth.uid()
        and role::text = 'supplier'
        and supplier_id is null
    )
  );

-- ── 3. Allow supplier to update their own profiles.supplier_id ─
-- profiles RLS typically blocks self-updates to protected columns.
-- Ensure suppliers can write supplier_id back to their own profile row.

drop policy if exists profiles_supplier_self_link on profiles;

create policy profiles_supplier_self_link on profiles
  for update to authenticated
  using  (id = auth.uid())
  with check (id = auth.uid());
