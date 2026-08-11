-- ============================================================================
-- 013_admissibility_determinations.sql — may this commodity, from there, enter?
--
-- Roadmap Phase 2 item 8. Reads the reference layer from 012 and records the
-- answer as a dated snapshot, following the architecture principle stated at
-- the top of the roadmap:
--
--   "Determinations are dated snapshots, not live queries. Each records the
--    rule version and inputs it was made against, so an FDA investigator sees
--    what was known at the time."
--
-- So the rule is not merely referenced, it is COPIED. A rule superseded next
-- year must not silently rewrite what an importer was told this year — the
-- determination has to be able to show the text it actually rested on, not
-- whatever that row says now.
--
-- Two controls make this table honest rather than decorative:
--
--   1. A determination CANNOT be made from a rule that is not current. Past its
--      review date the rule may still be right, but the warrant for asserting
--      it has lapsed, and a determination is an assertion. Enforced by trigger
--      here as well as in the API, because this is the whole point of the
--      review dating in 012.
--   2. A determination CANNOT OUTLIVE that warrant. Its expiry is capped at the
--      rule's review_due_at, so a rule falling overdue drags every
--      determination resting on it out of currency too. Otherwise a one-year
--      determination made against a rule reviewed eleven months ago would
--      outlast its own foundation by eleven months.
-- ============================================================================

begin;

create table admissibility_determinations (
  id                    uuid primary key default gen_random_uuid(),
  importer_id           uuid not null references importers(id) on delete cascade,
  product_id            uuid not null references products_verify(id) on delete cascade,
  commodity_id          uuid not null references commodities(id) on delete restrict,

  -- ── The inputs, recorded so the question is reproducible ─────────────────
  origin_country        text not null references countries(country_code),
  intended_use          text not null check (intended_use in
                          ('consumption', 'processing', 'propagation', 'research')),
  processing_state      text not null check (processing_state in
                          ('fresh', 'frozen', 'dried', 'cooked', 'canned', 'other')),

  -- ── The answer ───────────────────────────────────────────────────────────
  outcome               text not null check (outcome in
                          ('permitted', 'restricted', 'prohibited')),
  -- Copied from the rule at determination time, never joined at read time.
  citation              text not null,
  source_url            text not null,
  conditions            text[] not null default '{}',

  -- The rule this rests on, kept both as a reference (for "what changed since")
  -- and as a frozen copy (for "what did it say then"). on delete restrict: a
  -- rule underpinning a determination is not disposable.
  rule_id               uuid not null references country_commodity_rules(id) on delete restrict,
  rule_snapshot         jsonb not null,

  determined_at         timestamptz not null default now(),
  determined_by_profile_id uuid references profiles(id) on delete set null,
  rationale             text,

  -- Capped to the rule's review date by trigger below.
  expires_at            date not null,
  superseded_at         timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One live determination per product and question. Superseded rows stay.
create unique index ux_admissibility_live
  on admissibility_determinations (product_id, intended_use, processing_state)
  where superseded_at is null;

create index ix_admissibility_importer on admissibility_determinations (importer_id)
  where superseded_at is null;
create index ix_admissibility_expiry on admissibility_determinations (expires_at)
  where superseded_at is null;
create index ix_admissibility_rule on admissibility_determinations (rule_id);

-- ── The two controls ───────────────────────────────────────────────────────

create or replace function public.enforce_admissibility_warrant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rule country_commodity_rules;
begin
  select * into v_rule from country_commodity_rules where id = new.rule_id;

  if not found then
    raise exception 'The rule this determination cites does not exist.';
  end if;

  -- 1. No determination from a rule we cannot assert.
  if not public.rule_is_current(v_rule, new.determined_at::date) then
    raise exception
      'The country-commodity rule cited (% ) was not current on %. A rule that is superseded, '
      'outside its effective dates, or past its review date cannot support a determination — '
      're-check it against the agency and record the review first.',
      v_rule.citation, new.determined_at::date;
  end if;

  -- The determination must actually answer the question it claims to.
  if v_rule.commodity_id <> new.commodity_id then
    raise exception 'The cited rule is for a different commodity than the determination.';
  end if;

  -- 2. A determination cannot outlive the warrant it rests on.
  if new.expires_at > v_rule.review_due_at then
    new.expires_at := v_rule.review_due_at;
  end if;

  return new;
end;
$$;

create trigger trg_admissibility_warrant
  before insert or update on admissibility_determinations
  for each row execute function public.enforce_admissibility_warrant();

create trigger trg_admissibility_updated_at
  before update on admissibility_determinations
  for each row execute function public.set_updated_at();

-- ── Currency, for the gate and the UI ──────────────────────────────────────

create or replace function public.admissibility_is_current(
  p_det admissibility_determinations,
  p_on date default current_date
)
returns boolean
language sql
stable
as $$
  select p_det.superseded_at is null and p_det.expires_at >= p_on;
$$;

create view admissibility_determinations_status
with (security_invoker = true)
as
select
  d.*,
  public.admissibility_is_current(d.*)                       as is_current,
  (d.expires_at - current_date)                              as days_until_expiry,
  -- Surfaces "the ground moved under this determination": the rule it rests on
  -- has since been replaced, so the answer may no longer hold even though the
  -- determination has not expired.
  exists (
    select 1 from country_commodity_rules r
    where r.id = d.rule_id and r.superseded_at is not null
  )                                                          as rule_superseded
from admissibility_determinations d;

comment on view admissibility_determinations_status is
  'Admissibility determinations with currency computed. `rule_superseded` means '
  'the underlying country-commodity rule has been replaced since — the '
  'determination has not expired but should be re-made.';

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table admissibility_determinations enable row level security;

create policy admissibility_read on admissibility_determinations
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

create policy admissibility_write on admissibility_determinations
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

commit;
