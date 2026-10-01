-- ============================================================================
-- 032_fsvp_record_product_integrity.sql — an FSVP record must be about a
-- product its importer may hold, from the supplier that product comes from
--
-- THE BUG
--
-- fsvp_records.product_id only had to reference SOME product. Nothing tied it
-- to the record's own importer or supplier, so three records pointed at
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
-- nothing stopped a product from being claimed out from under another
-- importer's records. 031 then hid those products from Nutty Cathy, leaving
-- records about food its own product list cannot show.
--
-- In the app this surfaced as a record's blockers — "FSVP record from Pacific
-- Valley Foods has no accepted evidence…" — with no product to file them under
-- (lib/setup/fsvp-workflow.ts now ignores such records), and as rows on FSVP
-- Records naming a product the importer does not have.
--
-- THE RULE
--
-- A record's product must be the importer's own, or unclaimed; and the record's
-- supplier must be the product's supplier. Facility is NOT checked: a product
-- sourced from several facilities legitimately has one record per facility.
--
-- Enforced from both sides, because either side can break it:
--   1. fsvp_records insert/update — the record cannot point at a wrong product.
--   2. products_verify update     — a product cannot be claimed by, or moved
--                                   to, an importer or supplier that strands
--                                   another importer's records.
--
-- All FSVP data is test data (see project notes), so the three records are
-- deleted rather than repaired. Their attestations, evidence links and the
-- rest cascade or are set null by the existing foreign keys; no trigger blocks
-- a delete.
--
-- Run the preview SELECT first if you want to see what step 1 removes.
-- ============================================================================

-- Preview (optional, run on its own):
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

-- ── 1. Remove the records that break the rule ───────────────────────────────

delete from fsvp_records r
using products_verify p
where p.id = r.product_id
  and (
    (p.importer_id is not null and p.importer_id <> r.importer_id)
    or p.supplier_id is distinct from r.supplier_id
  );

-- ── 2. A record must match its product ──────────────────────────────────────

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

drop trigger if exists trg_fsvp_records_product on fsvp_records;
create trigger trg_fsvp_records_product
  before insert or update of product_id, importer_id, supplier_id on fsvp_records
  for each row execute function public.enforce_fsvp_record_product();

-- ── 3. A product cannot be moved out from under existing records ───────────

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
  for each row execute function public.enforce_product_record_owners();

commit;
