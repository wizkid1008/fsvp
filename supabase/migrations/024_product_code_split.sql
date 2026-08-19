-- ============================================================================
-- 024: Split FDA product codes across the tables that actually own them, and
--      give an importer somewhere to go when nothing in the taxonomy fits.
--
-- ── WHY THE SPLIT ─────────────────────────────────────────────────────────
--
-- Migration 012 gave `commodities` a single nullable `fda_product_code`. That
-- column cannot be filled honestly, because an FDA product code is not a fact
-- about a commodity.
--
-- FDA's own worked example is 38BEE27, concentrated canned tomato soup:
--
--     38    B          E        E                       27
--     Soup  Soup,Conc  METAL    COMMERCIALLY STERILE    Tomato soup, conc.
--     ────  ─────────  ───────  ──────────────────────  ──────────────────
--     industry  class  subclass  PIC (process)           product (group)
--
-- Subclass is the CONTAINER MATERIAL. PIC is the PROCESS. The same soup in
-- glass is a different code; frozen instead of retorted is a different code.
-- FDA states outright that determining a code requires "the label, the
-- processing information, intended use of product, the container type" — none
-- of which the taxonomy holds, and all of which belong to a particular product
-- as packed by a particular supplier.
--
-- So one commodity has MANY valid product codes, and the singular column was a
-- category error. This migration puts each component where the fact lives:
--
--   commodities      → industry, class, product group   (what the thing IS)
--   products_verify  → subclass, PIC, and the full code (how it is PACKED)
--
-- The full assembled code lands on products_verify rather than commodities for
-- the same reason: it is only meaningful once the packing is known, and it is
-- the value that actually appears on an ACE entry line.
--
-- ── WHY THE REQUEST TABLE ─────────────────────────────────────────────────
--
-- Today an importer whose product is not in the taxonomy has two options, and
-- both are bad. Abandon the product at step 4 of 11, or pick the nearest wrong
-- commodity. The second is the dangerous one: the determination that follows
-- resolves against country_commodity_rules for a DIFFERENT commodity, then gets
-- snapshotted with a citation and an expiry and presented as authoritative.
--
-- That is precisely the failure mode 012 was written to prevent, leaking in
-- through the UI instead of through the data. `commodity_classification_
-- requests` gives the importer a way to say "none of these fit" that leaves the
-- product honestly blocked on `not_classified` while an administrator adds the
-- commodity. Blocked and accurate beats classified and wrong.
-- ============================================================================

begin;

-- ── Commodity-level code components ────────────────────────────────────────
-- Nullable throughout, and deliberately so: 018 declined to assert FDA product
-- codes for the seeded taxonomy, and that reasoning has not changed. These are
-- filled per commodity as an administrator verifies them against FDA.

alter table commodities
  add column if not exists fda_industry_code text
    constraint commodities_fda_industry_format
      check (fda_industry_code is null or fda_industry_code ~ '^[0-9]{2}$'),
  add column if not exists fda_class_code text
    constraint commodities_fda_class_format
      check (fda_class_code is null or fda_class_code ~ '^[A-Z]$'),
  add column if not exists fda_product_group text
    constraint commodities_fda_group_format
      check (fda_product_group is null or fda_product_group ~ '^[0-9A-Z]{2}$');

comment on column commodities.fda_industry_code is
  'Two-digit FDA industry code — the broadest grouping ("38" is soup). A '
  'commodity-level fact: unlike subclass and PIC it does not change with how '
  'the goods are packed.';
comment on column commodities.fda_class_code is
  'One-letter FDA class code, meaningful only within its industry.';
comment on column commodities.fda_product_group is
  'Two-character FDA product (group) code identifying the product within its '
  'industry and class.';

-- Backfill from any code an administrator already entered.
--
-- Industry, class and group sit at FIXED positions — first two, third, and last
-- two — so they can be recovered from a code of any valid length. The middle is
-- NOT recoverable at six characters, where the single remaining character could
-- be either subclass or PIC and the format does not say which. Those two are
-- left for a person, matching decomposeProductCode() in the PCB client, which
-- refuses the same guess for the same reason.
update commodities
set fda_industry_code = substring(upper(btrim(fda_product_code)) from 1 for 2),
    fda_class_code    = substring(upper(btrim(fda_product_code)) from 3 for 1),
    fda_product_group = right(upper(btrim(fda_product_code)), 2)
where fda_product_code is not null
  and upper(btrim(fda_product_code)) ~ '^[0-9]{2}[A-Z][0-9A-Z-]{0,2}[0-9A-Z]{2}$';

-- Dropped rather than kept alongside the components. Retaining it would leave
-- two sources of truth for the same fact, and the one being dropped is the one
-- that cannot be stated correctly at this level.
alter table commodities drop column if exists fda_product_code;

-- ── Product-level (as-packed) code components ──────────────────────────────

alter table products_verify
  add column if not exists fda_subclass_code text
    constraint products_fda_subclass_format
      check (fda_subclass_code is null or fda_subclass_code ~ '^[A-Z-]$'),
  add column if not exists fda_pic_code text
    constraint products_fda_pic_format
      check (fda_pic_code is null or fda_pic_code ~ '^[A-Z-]$'),
  add column if not exists fda_product_code text
    constraint products_fda_code_format
      check (fda_product_code is null
             or fda_product_code ~ '^[0-9]{2}[A-Z][0-9A-Z-]{0,2}[0-9A-Z]{2}$'),
  add column if not exists fda_product_code_verified_at timestamptz;

-- A verification date with no code is meaningless, and a code carrying a
-- verification date it never earned is worse — it is the same "confident answer
-- nobody checked" this schema keeps refusing to store.
alter table products_verify
  drop constraint if exists products_fda_verified_needs_code;
alter table products_verify
  add constraint products_fda_verified_needs_code
    check (fda_product_code_verified_at is null or fda_product_code is not null);

comment on column products_verify.fda_subclass_code is
  'One-letter FDA subclass — the CONTAINER MATERIAL the product is packed in. '
  'A property of the goods as packed, not of the commodity: the same commodity '
  'in metal and in glass carries different subclasses. Hyphen where FDA uses '
  'one to mean the element does not apply.';
comment on column products_verify.fda_pic_code is
  'One-letter FDA Process Indicator Code — the process, storage or dosage form. '
  'Like subclass, a property of the goods as packed rather than the commodity.';
comment on column products_verify.fda_product_code is
  'The full FDA product code for this product as packed, as it would appear on '
  'an ACE entry line. Only meaningful once packing is known, which is why it '
  'lives here and not on commodities.';
comment on column products_verify.fda_product_code_verified_at is
  'When the code was last confirmed against FDA''s Product Code Builder API. '
  'Null means nobody has checked it, which is different from it being wrong.';

-- ── "None of these fit" ────────────────────────────────────────────────────

create table commodity_classification_requests (
  id                      uuid primary key default gen_random_uuid(),
  importer_id             uuid not null references importers(id) on delete cascade,
  product_id              uuid not null references products_verify(id) on delete cascade,
  requested_by_profile_id uuid references profiles(id) on delete set null,

  -- What the importer says the material is. Free text on purpose: the whole
  -- reason this row exists is that no controlled vocabulary covered it.
  described_as            text not null,
  -- Optional hints, using the same vocabulary as `commodities` so an
  -- administrator can act on the request without re-interviewing anyone.
  plant_part              text check (plant_part in (
                            'fruit', 'leaf', 'root', 'seed', 'stem', 'flower',
                            'whole_plant', 'bulb', 'tuber', 'not_applicable'
                          )),
  is_propagative          boolean,
  notes                   text,

  -- What FDA's Product Code Builder returned for the importer's search terms,
  -- snapshotted at request time. Evidence of what was looked at, not an
  -- assertion that any of it is the right answer — PCB search hits are product
  -- NAMES, and choosing among them is exactly the judgement being requested.
  pcb_candidates          jsonb,

  status                  text not null default 'open'
                            check (status in ('open', 'resolved', 'declined')),
  resolved_commodity_id   uuid references commodities(id) on delete set null,
  resolution_note         text,
  resolved_by_profile_id  uuid references profiles(id) on delete set null,
  resolved_at             timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint ccr_req_described check (length(btrim(described_as)) >= 2),
  -- Resolving means "here is the commodity to use". Without one the request is
  -- closed with nothing to act on, which reads to the importer as an answer.
  constraint ccr_req_resolution check (
    (status = 'open'     and resolved_commodity_id is null and resolved_at is null)
    or (status = 'resolved' and resolved_commodity_id is not null and resolved_at is not null)
    -- A refusal has to say why. "No" with no reason sends the importer back to
    -- guessing, which is the behaviour this table exists to stop.
    or (status = 'declined' and length(btrim(coalesce(resolution_note, ''))) >= 3
        and resolved_at is not null)
  )
);

-- One open request per product. A second is not more information, it is the
-- same question queued twice.
create unique index ux_ccr_req_one_open
  on commodity_classification_requests (product_id)
  where status = 'open';

create index ix_ccr_req_importer on commodity_classification_requests (importer_id);
create index ix_ccr_req_open on commodity_classification_requests (created_at)
  where status = 'open';

comment on table commodity_classification_requests is
  'Raised by an importer when no commodity in the taxonomy describes their '
  'product. Exists so the alternative to an empty dropdown is not picking the '
  'nearest wrong commodity — a determination made against the wrong commodity '
  'still arrives with a citation and an expiry and looks authoritative.';

comment on column commodity_classification_requests.resolved_commodity_id is
  'The commodity an administrator added or identified. Resolving does NOT '
  'classify the product: 21 CFR 1.500-series responsibility sits with the US '
  'importer, and /api/products/classify enforces that. The importer still makes '
  'the classification, now with something correct to choose.';

create trigger trg_ccr_req_updated_at
  before update on commodity_classification_requests
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Tenant-scoped like admissibility_determinations: an importer sees their own
-- requests, platform staff see all. Administrators write because resolving is
-- an act of maintaining global reference data.

alter table commodity_classification_requests enable row level security;

create policy ccr_req_read on commodity_classification_requests
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

create policy ccr_req_write on commodity_classification_requests
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

commit;
