-- 043_fsvp_plan_integration.sql
-- Bridges the current app schema (fsvp_records, suppliers, facilities_verify,
-- products_verify) to the FSVP compliance lifecycle:
--   1. DUNS / entry identity on suppliers (exporter side)
--   2. fsvp_plan_hazard_analyses  — hazard analysis anchored to fsvp_records
--   3. fsvp_plan_hazard_items     — per-hazard rows (bio/chem/physical/radio)
--   4. fsvp_verification_records  — instances of verification activity completed
--   5. compliance_alerts          — calendar-driven due-date alerts per importer

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DUNS on suppliers (exporter side, required for Flexport entry filing)
-- ─────────────────────────────────────────────────────────────────────────────
alter table suppliers
  add column if not exists duns_number       text,
  add column if not exists ufi_number        text,      -- EU UFI equivalent
  add column if not exists fsvp_identifier   text;      -- submitted at entry: usually DUNS

comment on column suppliers.duns_number     is 'D-U-N-S number used as FSVP importer identifier at CBP entry (§ 1.509)';
comment on column suppliers.fsvp_identifier is 'Override if not DUNS — e.g. IRS EIN, FDA FEI, or custom';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fsvp_plan_hazard_analyses
--    One per fsvp_record. Tracks the § 1.504 hazard analysis.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fsvp_plan_hazard_analyses (
  id                      uuid primary key default gen_random_uuid(),
  fsvp_record_id          uuid not null references fsvp_records(id) on delete cascade,
  version                 int  not null default 1,
  status                  text not null default 'draft'
                            check (status in ('draft', 'final', 'superseded')),
  -- § 1.504(b) — basis for analysis
  methodology_notes       text,
  relied_on_other_party   boolean not null default false,
  relied_on_party_name    text,                          -- supplier name if relied on
  relied_on_document_id   uuid references documents(id) on delete set null,
  -- Who performed the analysis
  performed_by_name       text,                          -- QI name (free text for now)
  performed_at            timestamptz,
  -- 3-year reassessment clock (§ 1.502(c))
  next_reassessment_due_at timestamptz,
  -- Outcome
  requires_supplier_verification boolean not null default true,
  verification_basis_notes text,
  -- Audit
  created_by_profile_id   uuid references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (fsvp_record_id, version)
);

create index if not exists ix_fsvp_ha_record on fsvp_plan_hazard_analyses (fsvp_record_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fsvp_plan_hazard_items
--    Child rows of a hazard analysis — one row per identified hazard.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fsvp_plan_hazard_items (
  id                      uuid primary key default gen_random_uuid(),
  hazard_analysis_id      uuid not null references fsvp_plan_hazard_analyses(id) on delete cascade,
  hazard_type             text not null
                            check (hazard_type in ('biological', 'chemical', 'physical', 'radiological')),
  hazard_name             text not null,                 -- e.g. "Salmonella", "Aflatoxin", "Metal fragments"
  known_or_reasonably_foreseeable boolean not null default true,
  requires_control        boolean not null default false,
  severity                text check (severity in ('low', 'moderate', 'high')),
  probability             text check (probability in ('low', 'moderate', 'high')),
  -- SAHCODHA flag (serious adverse health consequence or death to humans or animals)
  is_sahcodha             boolean not null default false,
  -- Who controls the hazard
  controlling_entity      text check (controlling_entity in
                            ('foreign_supplier', 'supplier_of_supplier', 'importer', 'customer')),
  controls_description    text,
  created_at              timestamptz not null default now()
);

create index if not exists ix_fsvp_hazard_items_analysis on fsvp_plan_hazard_items (hazard_analysis_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. fsvp_verification_records
--    Each row = one instance of a verification activity completed (§§ 1.506–1.507).
--    Multiple records can exist per fsvp_record (annual audits, each lot COA, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fsvp_verification_records (
  id                      uuid primary key default gen_random_uuid(),
  fsvp_record_id          uuid not null references fsvp_records(id) on delete cascade,
  activity_type           text not null
                            check (activity_type in
                              ('onsite_audit', 'sampling_testing', 'records_review',
                               'certificate_of_conformance', 'written_assurance', 'other')),
  -- Scheduling
  scheduled_date          date,
  completed_at            timestamptz,
  -- Outcome
  result                  text check (result in ('acceptable', 'unacceptable', 'inconclusive', 'pending')),
  result_notes            text,
  -- SAHCODHA audit flag (§ 1.506(b)(2))
  is_sahcodha_audit       boolean not null default false,
  -- Supporting document
  document_id             uuid references documents(id) on delete set null,
  -- Auditor / QI
  performed_by_name       text,
  -- Next due date (drives compliance_alerts)
  next_due_at             date,
  -- Status
  status                  text not null default 'planned'
                            check (status in ('planned', 'in_progress', 'completed', 'overdue', 'cancelled')),
  created_by_profile_id   uuid references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists ix_fsvp_vr_record on fsvp_verification_records (fsvp_record_id);
create index if not exists ix_fsvp_vr_due    on fsvp_verification_records (next_due_at)
  where status in ('planned', 'in_progress');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. compliance_alerts
--    Auto-generated and manually created alerts for the compliance calendar.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists compliance_alerts (
  id                      uuid primary key default gen_random_uuid(),
  importer_id             uuid not null references importers(id) on delete cascade,
  -- Optional source links
  fsvp_record_id          uuid references fsvp_records(id) on delete cascade,
  verification_record_id  uuid references fsvp_verification_records(id) on delete cascade,
  document_id             uuid references documents(id) on delete cascade,
  -- Alert definition
  alert_type              text not null check (alert_type in (
                            'reassessment_due',       -- 3-year clock
                            'verification_due',       -- scheduled activity coming up
                            'document_expiring',      -- cert/COA expiry
                            'corrective_action_open', -- unresolved CA
                            'supplier_approval_due',  -- supplier eval expiring
                            'entry_filing_pending'    -- shipment awaiting FSVP check
                          )),
  title                   text not null,
  description             text,
  due_date                date not null,
  severity                text not null default 'medium'
                            check (severity in ('low', 'medium', 'high', 'critical')),
  -- State
  status                  text not null default 'open'
                            check (status in ('open', 'acknowledged', 'resolved', 'snoozed')),
  snoozed_until           date,
  resolved_at             timestamptz,
  resolved_by_profile_id  uuid references profiles(id) on delete set null,
  -- Auto vs manual
  auto_generated          boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists ix_compliance_alerts_importer_due
  on compliance_alerts (importer_id, due_date)
  where status in ('open', 'acknowledged');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS — importers see only their own rows; admins see all
-- ─────────────────────────────────────────────────────────────────────────────

-- fsvp_plan_hazard_analyses
alter table fsvp_plan_hazard_analyses enable row level security;
create policy "importer read hazard analyses" on fsvp_plan_hazard_analyses
  for select using (
    exists (
      select 1 from fsvp_records r
      join profiles p on p.importer_id = r.importer_id
      where r.id = fsvp_plan_hazard_analyses.fsvp_record_id
        and p.id = auth.uid()
    )
  );
create policy "importer write hazard analyses" on fsvp_plan_hazard_analyses
  for all using (
    exists (
      select 1 from fsvp_records r
      join profiles p on p.importer_id = r.importer_id
      where r.id = fsvp_plan_hazard_analyses.fsvp_record_id
        and p.id = auth.uid()
        and p.role in ('us_importer', 'administrator')
    )
  );

-- fsvp_plan_hazard_items
alter table fsvp_plan_hazard_items enable row level security;
create policy "importer read hazard items" on fsvp_plan_hazard_items
  for select using (
    exists (
      select 1 from fsvp_plan_hazard_analyses ha
      join fsvp_records r on r.id = ha.fsvp_record_id
      join profiles p on p.importer_id = r.importer_id
      where ha.id = fsvp_plan_hazard_items.hazard_analysis_id
        and p.id = auth.uid()
    )
  );
create policy "importer write hazard items" on fsvp_plan_hazard_items
  for all using (
    exists (
      select 1 from fsvp_plan_hazard_analyses ha
      join fsvp_records r on r.id = ha.fsvp_record_id
      join profiles p on p.importer_id = r.importer_id
      where ha.id = fsvp_plan_hazard_items.hazard_analysis_id
        and p.id = auth.uid()
        and p.role in ('us_importer', 'administrator')
    )
  );

-- fsvp_verification_records
alter table fsvp_verification_records enable row level security;
create policy "importer read verification records" on fsvp_verification_records
  for select using (
    exists (
      select 1 from fsvp_records r
      join profiles p on p.importer_id = r.importer_id
      where r.id = fsvp_verification_records.fsvp_record_id
        and p.id = auth.uid()
    )
  );
create policy "importer write verification records" on fsvp_verification_records
  for all using (
    exists (
      select 1 from fsvp_records r
      join profiles p on p.importer_id = r.importer_id
      where r.id = fsvp_verification_records.fsvp_record_id
        and p.id = auth.uid()
        and p.role in ('us_importer', 'administrator')
    )
  );

-- compliance_alerts
alter table compliance_alerts enable row level security;
create policy "importer read alerts" on compliance_alerts
  for select using (
    exists (
      select 1 from profiles p
      where p.importer_id = compliance_alerts.importer_id
        and p.id = auth.uid()
    )
  );
create policy "importer update alerts" on compliance_alerts
  for update using (
    exists (
      select 1 from profiles p
      where p.importer_id = compliance_alerts.importer_id
        and p.id = auth.uid()
        and p.role in ('us_importer', 'administrator')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────────
create trigger trg_fsvp_ha_updated_at
  before update on fsvp_plan_hazard_analyses
  for each row execute function set_updated_at();

create trigger trg_fsvp_vr_updated_at
  before update on fsvp_verification_records
  for each row execute function set_updated_at();

create trigger trg_compliance_alerts_updated_at
  before update on compliance_alerts
  for each row execute function set_updated_at();
