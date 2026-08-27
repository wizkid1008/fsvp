-- ============================================================================
-- 026_reference_layer_source_fidelity.sql — let a rule say what the source says
--
-- 012 built the reference layer and 014 built the verification lifecycle around
-- it, both before anyone had read an ACIR requirement document end to end. On
-- 2026-08-27 three were read (docs/reference-layer-curation.md § 2.2, and the
-- extractions in background-documents/acir-exports/detail-reads/). The schema
-- could not hold any of them without altering them.
--
-- That matters more here than it would elsewhere. The whole design rests on a
-- second person confirming a rule against its source — but they confirm what
-- the SCREEN shows them, and the screen shows what the schema could store. A
-- distortion introduced at entry is invisible at verification, so it passes the
-- very check built to catch it. Fidelity to the source is therefore a
-- precondition for the two-person rule working at all, not a nicety.
--
-- Five changes, each traceable to a document that would not fit.
-- ============================================================================

begin;

-- ── 1. Plant parts APHIS actually names ────────────────────────────────────
-- "Cacao Bean Pod (Pod) from Mexico" gives Plant Part: Pod. 32 of the 41 rows
-- in the cocoa worklist are pods. A pod is not a fruit for APHIS purposes, and
-- coercing it into `fruit` would silently widen every rule built from these
-- documents to cover the fruit of the same species.
--
-- `all_including_seed` comes from the prohibition document, whose Plant Part is
-- "All Plant Parts Including Seed". It is stated in the source as a scope, not
-- inferred, so it is stored rather than expanded into eight rows.

alter table commodities drop constraint if exists commodities_plant_part_check;
alter table commodities
  add constraint commodities_plant_part_check check (plant_part in (
    'fruit', 'leaf', 'root', 'seed', 'stem', 'flower',
    'whole_plant', 'bulb', 'tuber', 'not_applicable',
    'pod', 'all_including_seed'
  ));

comment on column commodities.plant_part is
  'Which part enters, as APHIS names it. Part of the identity of a rule rather '
  'than a detail — mango fruit and mango leaves are different regulatory '
  'questions.';

-- ── 2. Processed states ACIR actually publishes ────────────────────────────
-- The Mexico document gives Processed State: "Fresh, Fresh Cut" — one document,
-- two states, and `fresh_cut` did not exist here.
--
-- Kept single-valued deliberately. The live-scope unique index and the
-- resolver's specificity ranking both read this as one value, and making it an
-- array would turn "the most specific rule wins" into a set-overlap problem for
-- the sake of a field that is short and enumerable. One such document becomes
-- two rule rows, which is also what a verifier will find easier to check
-- against the page.

alter table country_commodity_rules
  drop constraint if exists country_commodity_rules_processing_state_check;
alter table country_commodity_rules
  add constraint country_commodity_rules_processing_state_check
  check (processing_state in (
    'any', 'fresh', 'fresh_cut', 'frozen', 'dried', 'cooked', 'canned', 'other'
  ));

-- The determination table records the question that was asked, so it has to be
-- able to ask this one. Without this, a fresh_cut rule would be unreachable:
-- no importer could state the processing state that matches it.
alter table admissibility_determinations
  drop constraint if exists admissibility_determinations_processing_state_check;
alter table admissibility_determinations
  add constraint admissibility_determinations_processing_state_check
  check (processing_state in (
    'fresh', 'fresh_cut', 'frozen', 'dried', 'cooked', 'canned', 'other'
  ));

-- ── 3. "Not for Planting or Propagation" ───────────────────────────────────
-- ACIR's primary search axis, and the name of the category every document in
-- the current worklist came from. It is the negation of an enum value rather
-- than one of them: it means consumption, processing or research, but never
-- propagation.
--
-- Entering it as `any` was the only option before this, and `any` asserts that
-- the rule covers propagative material — the exact opposite of what the
-- document says, and wrong in the permissive direction. A rule permitting cacao
-- pods from Mexico would have appeared to permit importing them to plant.
--
-- Applied to the rules table only. products_verify.intended_use is left alone:
-- a product has ONE purpose, and "not for propagation" is not a purpose anybody
-- would enter for a shipment.

alter table country_commodity_rules
  drop constraint if exists country_commodity_rules_intended_use_check;
alter table country_commodity_rules
  add constraint country_commodity_rules_intended_use_check
  check (intended_use in (
    'any', 'consumption', 'processing', 'propagation', 'research',
    'not_for_propagation'
  ));

comment on column country_commodity_rules.intended_use is
  'The use this rule governs. `not_for_propagation` is the APHIS category and '
  'covers consumption, processing and research but never propagation — it sits '
  'between an exact use and `any` when the resolver ranks specificity.';

-- ── 4. Scopes that are neither a country nor a region ──────────────────────
-- "Dried Cocoa Leaves from All Countries" has no country and no region, and the
-- 012 constraint demanded exactly one. "Cacao Bean Pod from Inadmissible
-- Countries" is worse: a prohibition stated by ENUMERATING roughly 190
-- countries, which under the old schema meant 190 rows that would all have to
-- be found and corrected together the day APHIS granted one of them access.
--
-- Both are the same shape — a rule about everywhere — so `global` is added as
-- an explicit scope. That is then exactly what the enumerated prohibition
-- needs: ONE global prohibition, plus a country rule for each state that does
-- have access. Specificity already prefers the country rule, so granting access
-- means adding one row rather than deleting one from a list of 190, and a
-- country nobody has entered falls through to the prohibition, which is the
-- safe direction to fail in.
--
-- `origin_scope` is stored rather than inferred from two nulls. Inferring it
-- would mean a forgotten origin silently produces a GLOBAL rule, and the rule
-- most likely to be entered globally is a prohibition. Declaring the scope
-- makes that a decision instead of an omission.

alter table country_commodity_rules
  add column if not exists origin_scope text not null default 'country'
    check (origin_scope in ('country', 'region', 'global'));

-- Rows predating the column take their scope from what they carry. There are
-- none in production — country_commodity_rules has never been seeded — but a
-- development database may hold some.
update country_commodity_rules
   set origin_scope = case
         when origin_country is not null then 'country'
         when origin_region  is not null then 'region'
         else 'global'
       end
 where origin_scope = 'country'
   and origin_country is null;

alter table country_commodity_rules drop constraint if exists ccr_one_scope;
alter table country_commodity_rules
  add constraint ccr_scope_matches_columns check (
        (origin_scope = 'country' and origin_country is not null and origin_region is null)
     or (origin_scope = 'region'  and origin_country is null     and origin_region is not null)
     or (origin_scope = 'global'  and origin_country is null     and origin_region is null)
  );

comment on column country_commodity_rules.origin_scope is
  'Whether this rule is about one country, a region, or everywhere. Declared '
  'rather than inferred from null columns: a forgotten origin would otherwise '
  'become a global rule, and global rules are usually prohibitions.';

-- ── 5. The difference between "no" and "the document does not say" ─────────
-- The change this migration exists for.
--
-- These four were `not null default false`, so a document silent about
-- phytosanitary certificates produced a rule asserting that none is required.
-- The Mexico document says nothing about phyto. Under the old schema it would
-- have been stored as "no phytosanitary certificate required" — a confident
-- wrong answer, reached through the type system rather than through anybody's
-- carelessness, and indistinguishable at verification from a real negative.
--
-- The distinction is real in the sources: "Dried Cocoa Leaves" states "No
-- permit is required for this commodity", which is a genuine negative and is
-- stored as false. Silence is now null, and the resolver surfaces it as
-- something to check rather than something settled.

alter table country_commodity_rules
  alter column permit_required    drop not null,
  alter column permit_required    drop default,
  alter column phyto_required     drop not null,
  alter column phyto_required     drop default,
  alter column treatment_required drop not null,
  alter column treatment_required drop default,
  alter column peq_required       drop not null,
  alter column peq_required       drop default;

comment on column country_commodity_rules.permit_required is
  'True, false, or NULL when the source document does not say. NULL is not '
  '"no" — it reaches the importer as an unanswered question.';
comment on column country_commodity_rules.phyto_required is
  'True, false, or NULL when the source document does not say.';
comment on column country_commodity_rules.treatment_required is
  'True, false, or NULL when the source document does not say.';
comment on column country_commodity_rules.peq_required is
  'True, false, or NULL when the source document does not say.';

-- ── The status view ────────────────────────────────────────────────────────
-- Rebuilt because it selects `r.*`, which 014 learned the hard way is expanded
-- and frozen at creation time — a newly added column lands before the computed
-- ones and Postgres reads that as renaming a column. Dropped and recreated,
-- never replaced.
--
-- `has_unstated_requirements` is new. It lets the maintenance screen show which
-- drafts carry questions their source never answered, which is the first thing
-- a verifier needs to know before opening the page to check one.

drop view if exists country_commodity_rules_status;

create view country_commodity_rules_status
with (security_invoker = true)
as
select
  r.*,
  public.rule_is_current(r.*)                                   as is_current,
  (r.superseded_at is null and r.review_due_at < current_date)  as is_overdue,
  (r.verification_status = 'draft')                             as is_draft,
  (r.source_changed_at is not null)                             as source_moved,
  (r.permit_required is null or r.phyto_required is null
   or r.treatment_required is null or r.peq_required is null)   as has_unstated_requirements,
  (r.review_due_at - current_date)                              as days_until_review
from country_commodity_rules r;

comment on view country_commodity_rules_status is
  'Country-commodity rules with currency computed. A rule is usable only when '
  'verified, unsuperseded, inside its effective window, not past review, and '
  'not flagged as having moved at source. `has_unstated_requirements` marks a '
  'rule whose source was silent about a permit, phyto, treatment or PEQ.';

commit;
