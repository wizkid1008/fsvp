-- ============================================================================
-- 014_rule_verification.sql — a rule is not usable because someone typed it
--
-- 012 made every country-commodity rule carry a citation and a review date.
-- This adds the step before that: somebody other than the author confirming
-- the rule says what it claims.
--
-- The reasoning is in docs/reference-layer-curation.md. In short: APHIS ACIR
-- has no API, so every rule is transcribed by hand from an agency page, and
-- transcription errors are invisible to the person who made them. A plausible
-- but wrong treatment schedule is the worst artefact this system can hold —
-- worse than an empty table, because an importer told "no rule on file" goes
-- and looks, while one told "permitted, no permit required" stops looking.
--
-- Two states, and the distinction that matters:
--
--   draft     recorded and visible, cannot support a determination. It does
--             NOT behave like no rule: a draft covering the question forces
--             manual review. Treating it as absent would let a drafted
--             PROHIBITION be stepped over by silence — the same error as
--             ignoring a region rule we cannot evaluate.
--   verified  a named person confirmed it against the source on a date. Only
--             these can be resolved against.
--
-- Plus the hooks for change detection: the CFR part a rule rests on, so an
-- eCFR version change can flag every rule citing it, and a checksum of the
-- source page. Neither is populated here — this is the schema they need.
-- ============================================================================

begin;

alter table country_commodity_rules
  add column if not exists verification_status text not null default 'draft'
    check (verification_status in ('draft', 'verified'));

alter table country_commodity_rules
  add column if not exists verified_by_profile_id uuid references profiles(id) on delete set null,
  add column if not exists verified_at date,
  -- What was actually consulted. "ACIR, mango from Mexico, retrieved 2026-08-11"
  -- is a checkable claim; "verified" alone is not.
  add column if not exists verified_against text;

-- ── Change detection hooks ─────────────────────────────────────────────────

alter table country_commodity_rules
  -- e.g. '7 CFR 319'. Coarser than `citation` on purpose: the eCFR versions
  -- parts, and a change anywhere in the part is reason enough to re-read the
  -- section.
  add column if not exists cfr_part text,
  add column if not exists source_checksum text,
  add column if not exists source_checked_at timestamptz,
  -- Set by change detection, cleared by a fresh verification. Independent of
  -- review_due_at: this says "the ground moved", not "time passed".
  add column if not exists source_changed_at timestamptz;

comment on column country_commodity_rules.cfr_part is
  'The CFR part underpinning this rule, for eCFR change detection. Coarser than '
  'citation deliberately — a change anywhere in the part warrants re-reading.';
comment on column country_commodity_rules.source_changed_at is
  'Set when automated detection sees the underlying text change. Says "the '
  'ground moved", where review_due_at says "time passed". Either makes the rule '
  'unusable until re-verified.';

-- A verified rule must name who verified it, when, and against what.
-- Guarded so the migration can be re-run after a failure part way through;
-- Postgres has no `add constraint if not exists`.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'country_commodity_rules'::regclass
      and conname = 'ccr_verification_complete'
  ) then
    alter table country_commodity_rules
      add constraint ccr_verification_complete check (
        verification_status = 'draft'
        or (verified_by_profile_id is not null
            and verified_at is not null
            and length(btrim(coalesce(verified_against, ''))) >= 3)
      );
  end if;
end $$;

-- ── The two-person rule ────────────────────────────────────────────────────
-- Not because anyone is suspected. Because the person who mistyped a treatment
-- schedule is the person least able to see that they did.

create or replace function public.enforce_rule_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.verification_status = 'verified'
     and new.verified_by_profile_id is not null
     and new.created_by_profile_id is not null
     and new.verified_by_profile_id = new.created_by_profile_id
  then
    raise exception
      'A country-commodity rule must be verified by someone other than the person who entered it. '
      'Transcription errors are invisible to whoever made them.';
  end if;

  -- Editing a verified rule drops it back to draft. Otherwise a verification
  -- could be inherited by text nobody checked, which is the whole failure this
  -- is here to prevent.
  if tg_op = 'UPDATE'
     and old.verification_status = 'verified'
     and new.verification_status = 'verified'
     and (
          new.admissibility           is distinct from old.admissibility
       or new.permit_required         is distinct from old.permit_required
       or new.phyto_required          is distinct from old.phyto_required
       or new.treatment_required      is distinct from old.treatment_required
       or new.peq_required            is distinct from old.peq_required
       or new.additional_declarations is distinct from old.additional_declarations
       or new.designated_ports        is distinct from old.designated_ports
       or new.conditions_text         is distinct from old.conditions_text
       or new.citation                is distinct from old.citation
     )
  then
    raise exception
      'The substance of a verified rule cannot be edited in place — the verification would carry '
      'over to text nobody checked. Supersede it with a new row, or set it back to draft first.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rule_verification on country_commodity_rules;
create trigger trg_rule_verification
  before insert or update on country_commodity_rules
  for each row execute function public.enforce_rule_verification();

-- ── Currency now requires verification ─────────────────────────────────────
-- Replaces the 012 definition. A draft rule, or one whose source has been seen
-- to change, is not something the platform will assert.

-- Dropped rather than replaced. `create or replace view` cannot reorder or
-- rename columns, and the 012 view was `select r.*, is_current, …` — `r.*` is
-- expanded and FROZEN at creation time, so the columns added above land before
-- is_current and Postgres reads that as renaming a column. Worth remembering:
-- any view over `table.*` has to be dropped and recreated whenever the table
-- gains a column, not replaced.
drop view if exists country_commodity_rules_status;

create or replace function public.rule_is_current(
  p_rule country_commodity_rules,
  p_on date default current_date
)
returns boolean
language sql
stable
as $$
  select p_rule.verification_status = 'verified'
     and p_rule.source_changed_at is null
     and p_rule.superseded_at is null
     and p_rule.effective_from <= p_on
     and (p_rule.effective_to is null or p_rule.effective_to >= p_on)
     and p_rule.review_due_at >= p_on;
$$;

create view country_commodity_rules_status
with (security_invoker = true)
as
select
  r.*,
  public.rule_is_current(r.*)                                   as is_current,
  (r.superseded_at is null and r.review_due_at < current_date)  as is_overdue,
  (r.verification_status = 'draft')                             as is_draft,
  (r.source_changed_at is not null)                             as source_moved,
  (r.review_due_at - current_date)                              as days_until_review
from country_commodity_rules r;

comment on view country_commodity_rules_status is
  'Country-commodity rules with currency computed. A rule is usable only when '
  'verified, unsuperseded, inside its effective window, not past review, and '
  'not flagged as having moved at source.';

create index if not exists ix_ccr_needs_attention
  on country_commodity_rules (verification_status, review_due_at)
  where superseded_at is null;

commit;
