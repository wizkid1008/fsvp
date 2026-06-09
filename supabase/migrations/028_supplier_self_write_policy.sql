-- ============================================================
-- 028: Allow supplier-role users to insert and update their
--      own suppliers row without requiring admin privileges.
--
-- Previously suppliers_write required importer_id to be set,
-- which blocked supplier-portal users from creating their own
-- corporate record (they have no importer_id).
-- ============================================================

-- Replace the write policy to also allow a supplier user to
-- manage the row their profile is (or will be) linked to.

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
    or id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
  );

-- Also ensure the profiles.supplier_id FK points at suppliers(id).
-- Migration 013 created it referencing foreign_suppliers; migration 026
-- attempted a fix but used ADD COLUMN IF NOT EXISTS (no-op if column
-- existed). This safely drops and re-adds the FK constraint.

do $$
declare
  v_old_fk text;
begin
  -- Find any FK on profiles.supplier_id pointing at foreign_suppliers
  select tc.constraint_name into v_old_fk
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.table_name = kcu.table_name
  join information_schema.referential_constraints rc
    on tc.constraint_name = rc.constraint_name
  join information_schema.table_constraints tc2
    on rc.unique_constraint_name = tc2.constraint_name
  where tc.table_name        = 'profiles'
    and kcu.column_name      = 'supplier_id'
    and tc.constraint_type   = 'FOREIGN KEY'
    and tc2.table_name       = 'foreign_suppliers'
  limit 1;

  if v_old_fk is not null then
    execute format('alter table profiles drop constraint %I', v_old_fk);
  end if;

  -- Add correct FK if not already present pointing at suppliers
  if not exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_name = kcu.table_name
    join information_schema.referential_constraints rc
      on tc.constraint_name = rc.constraint_name
    join information_schema.table_constraints tc2
      on rc.unique_constraint_name = tc2.constraint_name
    where tc.table_name      = 'profiles'
      and kcu.column_name    = 'supplier_id'
      and tc.constraint_type = 'FOREIGN KEY'
      and tc2.table_name     = 'suppliers'
  ) then
    alter table profiles
      add column if not exists supplier_id uuid,
      add constraint profiles_supplier_id_fkey
        foreign key (supplier_id) references suppliers(id) on delete set null;
  end if;
end $$;
