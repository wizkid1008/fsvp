-- ============================================================================
-- 009_regulatory_intelligence.sql — what FDA has already observed about a firm
--
-- Until now a supplier's score rested entirely on evidence the supplier chose
-- to give us. 21 CFR 1.505(a)(1)(iv) does not allow that to be the whole
-- picture: evaluating a foreign supplier requires considering its compliance
-- history, and FDA names the specific artefacts — warning letters, import
-- alerts, and other compliance actions. FDA publishes exactly these datasets
-- and tells importers to use them for this purpose, on its Firm/Supplier
-- Evaluation Resources page (datadashboard.fda.gov/oii/fd/fser.htm).
--
-- Three tables rather than one, because the three things are different in kind
-- and confusing them is how a compliance system starts telling lies:
--
--   regulatory_events         what FDA published. A global fact about a firm
--                             named in FDA's data. No tenant, no opinion.
--   supplier_compliance_history  our claim that a given FDA record is about a
--                             given supplier of ours. A judgement, per tenant,
--                             that a person has to confirm.
--   regulatory_ingest_runs    when we last successfully asked, per source, so
--                             the screen can say how current it is instead of
--                             implying freshness it does not have.
--
-- The reason for the middle table is the matching problem. FDA identifies firms
-- by FEI number; we hold company names and countries and, for some, an FDA food
-- facility registration number, which is a different identifier. So most
-- matches can only be made on name and country, which is fuzzy. A false
-- positive here attributes another company's import refusal to a supplier and
-- damages their standing on our say-so. Therefore nothing attributed
-- automatically ever counts: rows land as 'candidate' and only a person moves
-- them to 'confirmed'. Only confirmed rows reach scoring, alerting or the
-- inspection package.
-- ============================================================================

begin;

-- ── Identifiers we can match on ────────────────────────────────────────────
-- FEI is FDA's establishment identifier and the only exact join available
-- against the Data Dashboard datasets. It is deliberately distinct from
-- fda_registration_number, which is the food facility registration (FFR)
-- number: they are different numbers and matching one against the other
-- produces confident nonsense.

alter table suppliers        add column fei_number text;
alter table facilities_verify add column fei_number text;

comment on column suppliers.fei_number is
  'FDA Establishment Identifier. The exact join key to FDA compliance data. '
  'Distinct from fda_registration_number (food facility registration).';
comment on column facilities_verify.fei_number is
  'FDA Establishment Identifier. Distinct from fda_registration_number.';

create index ix_suppliers_fei  on suppliers (fei_number)         where fei_number is not null;
create index ix_facilities_fei on facilities_verify (fei_number) where fei_number is not null;

-- ── Ingest provenance ──────────────────────────────────────────────────────
-- Recorded before the fact rather than after, so a run that dies halfway still
-- leaves evidence it was attempted. A screen that cannot prove when it last
-- refreshed is worse than one that admits it does not know.

create table regulatory_ingest_runs (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in (
                      'fda_food_enforcement',
                      'fda_import_refusals',
                      'fda_inspections_classifications',
                      'fda_compliance_actions'
                    )),
  status            text not null default 'running'
                      check (status in ('running', 'succeeded', 'failed')),
  -- The slice of time we asked the source for, so a gap in coverage is visible.
  window_from       date,
  window_to         date,
  records_seen      integer not null default 0,
  records_new       integer not null default 0,
  candidates_created integer not null default 0,
  error_message     text,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  triggered_by_profile_id uuid references profiles(id) on delete set null
);

create index ix_ingest_runs_source on regulatory_ingest_runs (source, started_at desc);

-- ── What FDA published ─────────────────────────────────────────────────────
-- Global and tenant-free: an import refusal is a fact about a firm, not about
-- one importer's relationship with it. Two importers buying from the same
-- supplier see the same underlying event and reach their own conclusions.

create table regulatory_events (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in (
                      'fda_food_enforcement',
                      'fda_import_refusals',
                      'fda_inspections_classifications',
                      'fda_compliance_actions'
                    )),
  -- The source's own identifier for this record. Together with source it is the
  -- dedupe key, so re-running an ingest is idempotent rather than duplicating
  -- history.
  source_ref        text not null,

  event_type        text not null check (event_type in (
                      'recall', 'import_refusal', 'inspection_classification',
                      'warning_letter', 'seizure', 'injunction', 'other_action'
                    )),
  event_date        date,

  -- Firm identity EXACTLY as FDA reported it. Never normalised in place: the
  -- matching layer derives normalised forms at compare time, and an
  -- investigator asking "why did you think this was our supplier" is entitled
  -- to see the string FDA actually published.
  firm_name         text,
  firm_fei          text,
  firm_country      text,
  firm_address      text,

  product_description text,
  -- One-line human summary composed at ingest for the review queue.
  summary           text not null,
  -- FDA's own severity vocabulary where it has one: recall classification
  -- (Class I/II/III) or inspection classification (NAI/VAI/OAI).
  classification    text,
  -- Everything the source returned, so a later question can be answered without
  -- a re-fetch and without having guessed the right columns today.
  detail_json       jsonb not null default '{}'::jsonb,
  source_url        text,

  retrieved_at      timestamptz not null default now(),
  ingest_run_id     uuid references regulatory_ingest_runs(id) on delete set null,
  created_at        timestamptz not null default now()
);

create unique index ux_regulatory_events_source_ref on regulatory_events (source, source_ref);
create index ix_regulatory_events_fei     on regulatory_events (firm_fei) where firm_fei is not null;
create index ix_regulatory_events_country on regulatory_events (firm_country, event_date desc);
-- The matching layer scans by normalised name; this supports the prefilter.
create index ix_regulatory_events_name    on regulatory_events (lower(firm_name));

-- ── Our claim that an event concerns our supplier ──────────────────────────
-- Tenant-scoped on purpose. Suppliers are shared entities, but a match
-- confirmation is a judgement, and one importer's judgement must not silently
-- become another's. Each importer confirms for itself, which is also what
-- § 1.505 asks of each importer separately.

create table supplier_compliance_history (
  id                  uuid primary key default gen_random_uuid(),
  importer_id         uuid not null references importers(id) on delete cascade,
  regulatory_event_id uuid not null references regulatory_events(id) on delete cascade,

  -- Exactly one target. An event concerns a firm; that firm is either a
  -- supplier we buy from or a facility that produces for us.
  supplier_id         uuid references suppliers(id) on delete cascade,
  facility_id         uuid references facilities_verify(id) on delete cascade,

  match_status        text not null default 'candidate'
                        check (match_status in ('candidate', 'confirmed', 'rejected')),
  -- How the candidate was proposed. 'fei_exact' is the only one that is
  -- evidence in itself; the rest are suggestions awaiting a human.
  match_method        text not null check (match_method in (
                        'fei_exact', 'name_country_exact', 'name_country_fuzzy', 'manual'
                      )),
  match_confidence    numeric(4,3) not null default 0
                        check (match_confidence >= 0 and match_confidence <= 1),
  -- Written by the matcher in plain words: what it compared and what it found.
  -- The reviewer is being asked to agree with reasoning, not a number.
  match_rationale     text not null,

  reviewed_by_profile_id uuid references profiles(id) on delete set null,
  reviewed_at            timestamptz,
  review_notes           text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint compliance_history_one_target check (
    (supplier_id is not null and facility_id is null)
    or (supplier_id is null and facility_id is not null)
  ),

  -- A decision must record who made it. Candidates have no reviewer yet.
  constraint compliance_history_reviewed check (
    match_status = 'candidate'
    or (reviewed_by_profile_id is not null and reviewed_at is not null)
  )
);

-- One row per tenant per event per target, so re-running the matcher tops up
-- rather than duplicating. Split in two because the null target column defeats
-- a single unique constraint.
create unique index ux_compliance_history_supplier
  on supplier_compliance_history (importer_id, regulatory_event_id, supplier_id)
  where supplier_id is not null;
create unique index ux_compliance_history_facility
  on supplier_compliance_history (importer_id, regulatory_event_id, facility_id)
  where facility_id is not null;

create index ix_compliance_history_queue
  on supplier_compliance_history (importer_id, match_status, created_at desc);
create index ix_compliance_history_supplier_confirmed
  on supplier_compliance_history (supplier_id, match_status)
  where match_status = 'confirmed';

create trigger trg_compliance_history_updated_at
  before update on supplier_compliance_history
  for each row execute function public.set_updated_at();

-- ── The screening record ───────────────────────────────────────────────────
-- § 1.505(a)(1)(iv) requires the importer to have CONSIDERED the supplier's
-- compliance history. Holding the data is not the same as having looked at it,
-- and only the second is a record. A screening says: on this date, against
-- these sources as they stood, this person reviewed what we hold on this
-- supplier and reached this conclusion.
--
-- Deliberately NOT auto-generated. A screening nobody performed is the exact
-- kind of paper an inspection is designed to catch.

create table supplier_compliance_screenings (
  id                  uuid primary key default gen_random_uuid(),
  importer_id         uuid not null references importers(id) on delete cascade,
  supplier_id         uuid not null references suppliers(id) on delete cascade,

  -- What the screener saw, frozen. Sources consulted and how fresh each was at
  -- the time, so a later reader can tell a clean screen from a screen of stale
  -- data.
  sources_json        jsonb not null default '{}'::jsonb,
  confirmed_event_count integer not null default 0,
  adverse_findings    text,
  conclusion          text not null check (conclusion in (
                        'no_adverse_history', 'adverse_history_accepted',
                        'adverse_history_blocking'
                      )),
  rationale           text not null,

  screened_by_profile_id uuid not null references profiles(id) on delete restrict,
  screened_at         timestamptz not null default now(),
  -- Compliance history goes stale. A screen from two years ago is not a current
  -- screen, and the approval gate should be able to say so.
  expires_at          date,
  superseded_at       timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index ux_compliance_screening_live
  on supplier_compliance_screenings (importer_id, supplier_id)
  where superseded_at is null;

create index ix_compliance_screening_expiry
  on supplier_compliance_screenings (expires_at)
  where superseded_at is null and expires_at is not null;

create trigger trg_compliance_screening_updated_at
  before update on supplier_compliance_screenings
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table regulatory_ingest_runs          enable row level security;
alter table regulatory_events               enable row level security;
alter table supplier_compliance_history     enable row level security;
alter table supplier_compliance_screenings  enable row level security;

-- FDA's published data is public and carries no tenant information. Every
-- signed-in user may read it; only the service role writes it, which is
-- achieved by granting no write policy at all.
create policy regulatory_events_read on regulatory_events
  for select to authenticated using (true);

-- Freshness is not a secret, and the screen needs it to caveat itself.
create policy ingest_runs_read on regulatory_ingest_runs
  for select to authenticated using (true);

-- Attribution is tenant data. Exporters are excluded on purpose: this is the
-- importer's evaluation of them, and § 1.505 evaluations are not shared with
-- the supplier being evaluated.
create policy compliance_history_read on supplier_compliance_history
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

-- Confirming a match is a compliance judgement, so the unrestricted helper is
-- used here — a tenant's qualified individual does this work, the same as
-- signing an attestation.
create policy compliance_history_write on supplier_compliance_history
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

create policy compliance_screening_read on supplier_compliance_screenings
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

create policy compliance_screening_write on supplier_compliance_screenings
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

commit;
