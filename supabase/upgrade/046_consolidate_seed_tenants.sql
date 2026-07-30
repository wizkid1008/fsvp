-- ============================================================================
-- 046_consolidate_seed_tenants.sql
--
-- After the tenancy split in 045, this database had four organizations but only
-- two user accounts, and almost all the data sat under the two seeded
-- organizations that nobody was attached to:
--
--   GreenPath Foods         0 accounts   5 records   4 docs   10 products
--   Pacific Coast Imports   0 accounts   1 record    0 docs    0 products
--   ThrushCross             1 account    0 records   1 doc     0 products
--   Vegan Meats             1 account    0 records   0 docs    0 products
--
-- This moves the DATA to the ACCOUNTS rather than the accounts to the data, so
-- the surviving organization names stay meaningful:
--
--   GreenPath Foods       -> ThrushCross    (the primary account)
--   Pacific Coast Imports -> Vegan Meats    (the second importer)
--
-- The two emptied seed organizations are then deleted. Result: exactly two
-- tenants, each with one account and disjoint data — which is also the fixture
-- that proves the tenancy split holds.
--
-- Every table carrying importer_id is remapped, discovered dynamically so no
-- table is missed. Run AFTER 045 and 001_baseline_rls.sql.
--
-- Edit the two names in section 1 if you want a different pairing.
-- ============================================================================

begin;

do $$
declare
  v_from_a uuid;  -- GreenPath Foods
  v_to_a   uuid;  -- ThrushCross
  v_from_b uuid;  -- Pacific Coast Imports
  v_to_b   uuid;  -- Vegan Meats
  r        record;
  n        bigint;
  v_total  bigint := 0;
begin

  -- ── 1. Resolve the organizations ─────────────────────────────────────────
  select id into v_from_a from importers where display_name = 'GreenPath Foods';
  select id into v_to_a   from importers where display_name = 'ThrushCross';
  select id into v_from_b from importers where display_name = 'Pacific Coast Imports';
  select id into v_to_b   from importers where display_name = 'Vegan Meats';

  if v_to_a is null then
    raise exception 'Target organization "ThrushCross" not found — check display_name spelling.';
  end if;
  if v_to_b is null then
    raise exception 'Target organization "Vegan Meats" not found — check display_name spelling.';
  end if;

  -- Refuse to merge an organization that still has its own users.
  if exists (select 1 from profiles where importer_id in (v_from_a, v_from_b)) then
    raise exception 'A source organization still has user accounts attached. Nothing moved.';
  end if;

  -- ── 2. supplier_relationships needs dedupe before remapping ──────────────
  -- unique (importer_id, supplier_id): if the source and target both link the
  -- same supplier, remapping would collide. Drop the source row in that case —
  -- the target already has the relationship.
  delete from supplier_relationships sr
  where sr.importer_id = v_from_a
    and exists (
      select 1 from supplier_relationships t
      where t.importer_id = v_to_a and t.supplier_id = sr.supplier_id
    );

  delete from supplier_relationships sr
  where sr.importer_id = v_from_b
    and exists (
      select 1 from supplier_relationships t
      where t.importer_id = v_to_b and t.supplier_id = sr.supplier_id
    );

  -- ── 3. fsvp_records needs the same treatment ─────────────────────────────
  -- unique (importer_id, supplier_id, facility_id, product_id)
  delete from fsvp_records f
  where f.importer_id = v_from_a
    and exists (
      select 1 from fsvp_records t
      where t.importer_id = v_to_a
        and t.supplier_id = f.supplier_id
        and t.facility_id = f.facility_id
        and t.product_id  = f.product_id
    );

  delete from fsvp_records f
  where f.importer_id = v_from_b
    and exists (
      select 1 from fsvp_records t
      where t.importer_id = v_to_b
        and t.supplier_id = f.supplier_id
        and t.facility_id = f.facility_id
        and t.product_id  = f.product_id
    );

  -- ── 4. Remap every table that carries importer_id ────────────────────────
  -- Discovered from the catalog rather than hardcoded, so nothing is missed.
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name  = 'importer_id'
      and t.table_type   = 'BASE TABLE'
      and c.table_name  <> 'profiles'   -- accounts stay where they are
    order by c.table_name
  loop
    execute format(
      'update public.%I set importer_id = $1 where importer_id = $2', r.table_name
    ) using v_to_a, v_from_a;
    get diagnostics n = row_count;
    v_total := v_total + n;
    if n > 0 then
      raise notice '  % : % row(s) GreenPath -> ThrushCross', r.table_name, n;
    end if;

    execute format(
      'update public.%I set importer_id = $1 where importer_id = $2', r.table_name
    ) using v_to_b, v_from_b;
    get diagnostics n = row_count;
    v_total := v_total + n;
    if n > 0 then
      raise notice '  % : % row(s) Pacific Coast -> Vegan Meats', r.table_name, n;
    end if;
  end loop;

  raise notice 'Remapped % row(s) in total.', v_total;

  -- ── 5. Delete the now-empty seed organizations ───────────────────────────
  -- Safe only because everything above moved off them. importers cascades to
  -- most child tables, so this must come last.
  delete from importers where id in (v_from_a, v_from_b);

  raise notice 'Deleted the emptied seed organizations.';

end $$;

-- ── 6. Result ──────────────────────────────────────────────────────────────
select
  i.display_name,
  (select count(*) from profiles p        where p.importer_id  = i.id) as accounts,
  (select count(*) from fsvp_records f    where f.importer_id  = i.id) as records,
  (select count(*) from documents d       where d.importer_id  = i.id) as docs,
  (select count(*) from products_verify pr where pr.importer_id = i.id) as products,
  (select count(*) from supplier_relationships sr where sr.importer_id = i.id) as exporters
from importers i
order by i.display_name;

commit;
