-- ============================================================================
-- 032_fsvp_record_product_integrity.sql — an FSVP record must be about a
-- product its importer may hold, from the supplier that product comes from
--
-- THE BUG
--
-- fsvp_records.product_id only had to reference SOME product. Nothing tied it
-- to the record's own importer or supplier, so three records point at
-- ThrushCross's products while belonging to someone else:
--
--   e5000000-…-0004  Vegan Meats  → ThrushCross's Roasted Coffee Beans, and
--                    filed under Pacific Valley Foods although that product
--                    comes from Andes Ingredients (a seed-data slip)
--   43c16cdf-…       Nutty Cathy  → ThrushCross's Cocoa Nibs
--   df41b957-…       Nutty Cathy  → ThrushCross's Roasted Coffee Beans
--
-- The Nutty Cathy pair were most likely valid when made: the products were
-- unclaimed (importer_id null) until ThrushCross's ownership was recorded, and
-- /api/products/save claims an unclaimed product for whichever importer saves
-- it, with nothing checking for other importers' records.
--
-- In the app this surfaced as a record's blockers with no product to file them
-- under (lib/setup/fsvp-workflow.ts now ignores such records).
--
-- THE RULE
--
-- A record's product must be the importer's own, or unclaimed; and the record's
-- supplier must be the product's supplier. Facility is NOT checked: a product
-- sourced from several facilities legitimately has one record per facility.
--
-- Enforced from both sides, because either side can break it:
--   1. fsvp_records  — a record cannot be created, or re-pointed, at a wrong
--                      product.
--   2. products_verify — a product cannot be claimed by, or moved to, an
--                      importer or supplier that strands another importer's
--                      records.
--
-- WHAT THIS DOES NOT DO
--
-- It does not remove the three records above. They are inside the § 1.510(c)
-- two-year retention period, and migration 011's guard refuses to delete them
-- (the service role included, deliberately). Removing them means a decision
-- about that guard, which is left to whoever runs this — see the preview query
-- below to list them.
--
-- The triggers only fire on CHANGES to the linking columns, so those existing
-- rows do not block unrelated work: ThrushCross can still edit its own Cocoa
-- Nibs (the save route re-sends importer_id unchanged), and the stranded
-- records can still change status.
-- ============================================================================

-- Records that break the rule (run on its own to list them):
--
-- select r.id, i.display_name as record_importer, p.product_name,
--        pi.display_name as product_owner,
--        r.supplier_id = p.supplier_id as supplier_matches
-- from fsvp_records r
-- join products_verify p on p.id = r.product_id
-- join importers i on i.id = r.importer_id
-- left join importers pi on pi.id = p.importer_id
-- where (p.importer_id is not null and p.importer_id <> r.importer_id)
--    or p.supplier_id is distinct from r.supplier_id;

begin;

-- ── 1. A record must match its product ──────────────────────────────────────

-- security definer: the product may be invisible to the writer under
-- products_read (031) — which is exactly the case this has to catch, so the
-- lookup must not be filtered by RLS.
create or replace function public.enforce_fsvp_record_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product record;
begin
  select importer_id, supplier_id, product_name
    into v_product
  from products_verify
  where id = new.product_id;

  if not found then
    raise exception 'FSVP record references an unknown product.';
  end if;

  if v_product.importer_id is not null and v_product.importer_id <> new.importer_id then
    raise exception
      'Product "%" belongs to a different importer, so this importer cannot hold an FSVP record for it.',
      v_product.product_name;
  end if;

  if v_product.supplier_id is distinct from new.supplier_id then
    raise exception
      'The FSVP record''s supplier must be the supplier product "%" comes from.',
      v_product.product_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fsvp_records_product_insert on fsvp_records;
create trigger trg_fsvp_records_product_insert
  before insert on fsvp_records
  for each row execute function public.enforce_fsvp_record_product();

drop trigger if exists trg_fsvp_records_product_update on fsvp_records;
create trigger trg_fsvp_records_product_update
  before update of product_id, importer_id, supplier_id on fsvp_records
  for each row
  when (
    new.product_id  is distinct from old.product_id
    or new.importer_id is distinct from old.importer_id
    or new.supplier_id is distinct from old.supplier_id
  )
  execute function public.enforce_fsvp_record_product();

-- ── 2. A product cannot be moved out from under existing records ───────────

create or replace function public.enforce_product_record_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.importer_id is not null and exists (
    select 1 from fsvp_records
    where product_id = new.id and importer_id <> new.importer_id
  ) then
    raise exception
      'Product "%" has FSVP records held by another importer, so it cannot be assigned to this one.',
      new.product_name;
  end if;

  if exists (
    select 1 from fsvp_records
    where product_id = new.id and supplier_id is distinct from new.supplier_id
  ) then
    raise exception
      'Product "%" has FSVP records filed under its current supplier, so its supplier cannot change.',
      new.product_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_verify_record_owners on products_verify;
create trigger trg_products_verify_record_owners
  before update of importer_id, supplier_id on products_verify
  for each row
  when (
    new.importer_id is distinct from old.importer_id
    or new.supplier_id is distinct from old.supplier_id
  )
  execute function public.enforce_product_record_owners();

commit;
