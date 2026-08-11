-- ============================================================================
-- 012_reference_layer.sql — the commodity taxonomy and country-commodity rules
--
-- Roadmap Phase 2 item 7, and the foundation everything else in Phase 2 stands
-- on: an admissibility determination is only as good as the rule it was made
-- against.
--
-- THE GOVERNING CONSTRAINT, from the roadmap's own integration section:
--
--   "Ingest what has an API, curate what does not, and never present a curated
--    table as authoritative without a citation and a review date. A
--    country-commodity rule table that silently goes stale is worse than no
--    table at all, because it produces confident wrong answers."
--
-- APHIS publishes no usable API for commodity admissibility, so this table is
-- curated by hand. That makes staleness the primary risk — not absence. An
-- importer told "no permit required" by a rule nobody has checked since 2024 is
-- worse off than one told "we do not know", because the first stops looking.
--
-- So three things are structural rather than optional:
--
--   1. `citation` and `source_url` are NOT NULL. A rule that cannot say where it
--      came from cannot be entered at all.
--   2. `reviewed_at` and `review_due_at` are NOT NULL, and a rule past its
--      review date is NOT current — see public.rule_is_current(). It stays
--      readable, and stops being authoritative.
--   3. Rules are effective-dated and never edited in place. Superseding writes a
--      new row, so a determination made last year can still show the rule text
--      it was actually made against.
--
-- Deliberately NOT reusing `rule_versions`: that versions the FSVP requirement
-- set, which is a different thing changing on a different cadence for different
-- reasons. Sharing the table would couple a produce admissibility correction to
-- the publication of an FSVP scoring change.
-- ============================================================================

begin;

-- ── Commodity taxonomy ─────────────────────────────────────────────────────
-- Global and tenant-free. A commodity is a fact about the world, not about one
-- importer. (An earlier `commodities` table existed pre-014 and was dropped in
-- the baseline as unused — see 000_baseline.sql. This is not that table.)

create table commodities (
  id                uuid primary key default gen_random_uuid(),

  common_name       text not null,
  scientific_name   text,
  -- Broad grouping, used to route agency jurisdiction later (item 10).
  commodity_class   text not null check (commodity_class in (
                      'fruit', 'vegetable', 'nut', 'grain', 'herb_spice',
                      'seafood', 'meat_poultry', 'dairy', 'egg',
                      'beverage', 'processed_food', 'supplement', 'other'
                    )),
  -- Which part enters. APHIS rules differ sharply between, say, mango fruit and
  -- mango leaves, so this is part of the identity of a rule, not a detail.
  plant_part        text check (plant_part in (
                      'fruit', 'leaf', 'root', 'seed', 'stem', 'flower',
                      'whole_plant', 'bulb', 'tuber', 'not_applicable'
                    )),
  -- Propagative material (anything capable of growing) is regulated far more
  -- strictly than the same species as food.
  is_propagative    boolean not null default false,

  fda_product_code  text,
  notes             text,
  active            boolean not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Same species entering as a different part, or as propagative material, is a
-- different commodity for admissibility purposes.
create unique index ux_commodities_identity
  on commodities (lower(common_name), coalesce(plant_part, ''), is_propagative);

create index ix_commodities_class on commodities (commodity_class) where active;

-- ── Country-commodity rules ────────────────────────────────────────────────

create table country_commodity_rules (
  id                    uuid primary key default gen_random_uuid(),
  commodity_id          uuid not null references commodities(id) on delete restrict,

  -- Either a specific country or a region. One of the two, never both: a rule
  -- that is somehow both "Mexico" and "South America" cannot be resolved.
  origin_country        text references countries(country_code),
  origin_region         text,

  intended_use          text not null default 'any' check (intended_use in
                          ('any', 'consumption', 'processing', 'propagation', 'research')),
  processing_state      text not null default 'any' check (processing_state in
                          ('any', 'fresh', 'frozen', 'dried', 'cooked', 'canned', 'other')),

  -- The determination this rule supports.
  admissibility         text not null check (admissibility in
                          ('permitted', 'restricted', 'prohibited')),

  permit_required       boolean not null default false,
  phyto_required        boolean not null default false,
  treatment_required    boolean not null default false,
  peq_required          boolean not null default false,
  additional_declarations text[],
  designated_ports      text[],
  conditions_text       text,

  -- ── Provenance. Not optional, ever. ──────────────────────────────────────
  citation              text not null,
  source_url            text not null,

  -- ── Staleness control. Also not optional. ────────────────────────────────
  reviewed_at           date not null default current_date,
  reviewed_by_profile_id uuid references profiles(id) on delete set null,
  -- A curated rule is a claim about what an agency currently says. That claim
  -- decays. Defaulted to a year out rather than left open, because a nullable
  -- review date is how a table quietly becomes permanent.
  review_due_at         date not null default (current_date + interval '365 days'),

  effective_from        date not null default current_date,
  effective_to          date,
  superseded_at         timestamptz,

  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint ccr_one_scope check (
    (origin_country is not null and origin_region is null)
    or (origin_country is null and origin_region is not null)
  ),
  constraint ccr_review_forward check (review_due_at > reviewed_at),
  constraint ccr_effective_window check (effective_to is null or effective_to > effective_from),
  -- A prohibition with no stated authority is an assertion, and this table
  -- exists precisely so that assertions cannot masquerade as rules.
  constraint ccr_citation_substantive check (length(btrim(citation)) >= 3)
);

-- One live rule per exact scope. Superseded rows stay: a determination made
-- last year must still be able to show the rule it was made against.
create unique index ux_ccr_live_scope
  on country_commodity_rules (
    commodity_id,
    coalesce(origin_country, ''),
    coalesce(origin_region, ''),
    intended_use,
    processing_state
  )
  where superseded_at is null;

create index ix_ccr_commodity on country_commodity_rules (commodity_id) where superseded_at is null;
create index ix_ccr_country   on country_commodity_rules (origin_country) where superseded_at is null;
-- Drives the "what needs re-checking" screen.
create index ix_ccr_review_due on country_commodity_rules (review_due_at) where superseded_at is null;

-- ── What "current" means ───────────────────────────────────────────────────
--
-- Three separate ways a rule stops being usable, and they are not the same:
--
--   superseded  — replaced by a newer row. Historical.
--   out of window — effective_from/to do not cover the date asked about.
--   OVERDUE     — still in force, but nobody has confirmed it since
--                 review_due_at. This is the one that matters. The rule may
--                 well still be correct; what has expired is our warrant for
--                 saying so.
--
-- An overdue rule is deliberately still READABLE. Hiding it would send someone
-- to look the answer up by hand with no starting point. It simply stops being
-- something the platform will assert.

create or replace function public.rule_is_current(
  p_rule country_commodity_rules,
  p_on date default current_date
)
returns boolean
language sql
stable
as $$
  select p_rule.superseded_at is null
     and p_rule.effective_from <= p_on
     and (p_rule.effective_to is null or p_rule.effective_to >= p_on)
     and p_rule.review_due_at >= p_on;
$$;

comment on function public.rule_is_current is
  'True when a country-commodity rule may be relied on. False once it is '
  'superseded, outside its effective window, or past its review date — an '
  'overdue rule is still readable but is no longer authoritative.';

-- Convenience view for the admissibility engine and the maintenance screen.
create view country_commodity_rules_status
with (security_invoker = true)
as
select
  r.*,
  public.rule_is_current(r.*)                                   as is_current,
  (r.superseded_at is null and r.review_due_at < current_date)  as is_overdue,
  (r.review_due_at - current_date)                              as days_until_review
from country_commodity_rules r;

comment on view country_commodity_rules_status is
  'Country-commodity rules with their currency computed. `is_overdue` means the '
  'rule is still in force but nobody has re-checked it against the agency since '
  'review_due_at, so it must not be presented as authoritative.';

-- ── Link products to the taxonomy ──────────────────────────────────────────
-- Nullable: an importer may record a product long before anyone classifies it,
-- and forcing a commodity at creation would push people into guessing.

alter table products_verify
  add column if not exists commodity_id uuid references commodities(id) on delete set null;

create index if not exists ix_products_commodity on products_verify (commodity_id)
  where commodity_id is not null;

comment on column products_verify.commodity_id is
  'Links the product to the reference taxonomy. Null until someone classifies '
  'it; admissibility cannot be determined until it is set.';

-- ── updated_at ─────────────────────────────────────────────────────────────

create trigger trg_commodities_updated_at
  before update on commodities
  for each row execute function public.set_updated_at();
create trigger trg_ccr_updated_at
  before update on country_commodity_rules
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Reference data is global and carries no tenant information, so every signed-in
-- user reads it. Only platform administrators write it.
--
-- The roadmap proposes a dedicated `regulatory_administrator` role that
-- maintains the reference layer without seeing tenant commercial data. That
-- separation is right and is NOT implemented here: adding an app_role touches
-- every guard in the application, and doing it as a side effect of shipping the
-- taxonomy would be the kind of change that hides inside another change. Until
-- then the platform administrator maintains it.

alter table commodities              enable row level security;
alter table country_commodity_rules  enable row level security;

create policy commodities_read on commodities
  for select to authenticated using (true);

create policy commodities_write on commodities
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy ccr_read on country_commodity_rules
  for select to authenticated using (true);

create policy ccr_write on country_commodity_rules
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

commit;
