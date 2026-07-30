-- 022_fsvp_records_scoring_approvals.sql
-- Adds: scoring_results, fsvp_records, fsvp_record_evidence,
--       approval_decisions, reassessment_schedules.
-- Depends on: migration 021 (rule_versions, requirement_items, suppliers,
--             facilities_verify, products_verify).

-- ============================================================
-- 1. scoring_results — cached per-entity score snapshots
-- ============================================================
create table if not exists scoring_results (
  id                        uuid primary key default gen_random_uuid(),
  entity_type               text not null check (entity_type in ('facility', 'product', 'fsvp_record')),
  entity_id                 uuid not null,
  rule_version_id           uuid not null references rule_versions(id) on delete restrict,
  overall_score             numeric(5,2) not null default 0,
  section_scores            jsonb not null default '{}'::jsonb,
  is_stale                  boolean not null default false,
  critical_blockers_present boolean not null default false,
  calculated_at             timestamptz not null default now(),
  unique (entity_type, entity_id, rule_version_id)
);

-- ============================================================
-- 2. fsvp_records — the importer-owned FSVP compliance record
--    Each record is unique to: importer + supplier + facility + product
-- ============================================================
create table if not exists fsvp_records (
  id                          uuid primary key default gen_random_uuid(),
  importer_id                 uuid not null references importers(id) on delete cascade,
  supplier_id                 uuid not null references suppliers(id) on delete restrict,
  facility_id                 uuid not null references facilities_verify(id) on delete restrict,
  product_id                  uuid not null references products_verify(id) on delete restrict,
  rule_version_id             uuid not null references rule_versions(id) on delete restrict,
  status                      text not null default 'draft'
    check (status in (
      'draft',
      'awaiting_supplier_evidence',
      'supplier_evidence_submitted',
      'supplier_evidence_accepted',
      'importer_review_pending',
      'importer_approved',
      'conditionally_approved',
      'needs_corrective_action',
      'rejected',
      'expired',
      'reassessment_due'
    )),
  -- Importer-authored narrative sections
  hazard_analysis_notes       text,
  supplier_evaluation_notes   text,
  facility_evaluation_notes   text,
  verification_determination  text,
  overall_score               numeric(5,2),
  -- Approval outcome
  approval_decision           text
    check (approval_decision in ('approved', 'conditionally_approved', 'rejected')),
  approved_by_profile_id      uuid references profiles(id) on delete set null,
  approved_at                 timestamptz,
  reassessment_due_at         timestamptz,
  -- Audit
  created_by_profile_id       uuid references profiles(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- Each importer can have exactly one record per supplier/facility/product combination
  unique (importer_id, supplier_id, facility_id, product_id)
);

-- ============================================================
-- 3. fsvp_record_evidence — accepted documents attached to a record
-- ============================================================
create table if not exists fsvp_record_evidence (
  id                     uuid primary key default gen_random_uuid(),
  fsvp_record_id         uuid not null references fsvp_records(id) on delete cascade,
  document_id            uuid not null references documents(id) on delete restrict,
  requirement_item_id    uuid references requirement_items(id) on delete set null,
  attached_by_profile_id uuid references profiles(id) on delete set null,
  attached_at            timestamptz not null default now(),
  notes                  text,
  unique (fsvp_record_id, document_id)
);

-- ============================================================
-- 4. approval_decisions — full history of every approval action
--    on a record; the current decision is also mirrored on fsvp_records
-- ============================================================
create table if not exists approval_decisions (
  id                     uuid primary key default gen_random_uuid(),
  fsvp_record_id         uuid not null references fsvp_records(id) on delete cascade,
  importer_id            uuid not null references importers(id) on delete cascade,
  decision               text not null
    check (decision in ('approved', 'conditionally_approved', 'rejected', 'revision_requested')),
  decision_notes         text,
  conditions_text        text,
  decided_by_profile_id  uuid not null references profiles(id) on delete restrict,
  decided_at             timestamptz not null default now(),
  rule_version_id        uuid not null references rule_versions(id) on delete restrict
);

-- ============================================================
-- 5. reassessment_schedules
-- ============================================================
create table if not exists reassessment_schedules (
  id               uuid primary key default gen_random_uuid(),
  fsvp_record_id   uuid not null references fsvp_records(id) on delete cascade,
  importer_id      uuid not null references importers(id) on delete cascade,
  frequency_months int not null default 12,
  last_assessed_at timestamptz,
  next_due_at      timestamptz not null,
  status           text not null default 'scheduled'
    check (status in ('scheduled', 'overdue', 'completed', 'cancelled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- 6. Trigger: mark scoring_results stale when evidence status changes
-- ============================================================
create or replace function public.mark_scores_stale_on_evidence_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Stale facility score when document is linked to a facility
  if new.facility_id is not null then
    update scoring_results
    set is_stale = true
    where entity_type = 'facility' and entity_id = new.facility_id;
  end if;

  -- Stale product score when document is linked to a product
  if new.linked_entity_type = 'product' and new.linked_entity_id is not null then
    update scoring_results
    set is_stale = true
    where entity_type = 'product' and entity_id = new.linked_entity_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_documents_mark_scores_stale on documents;
create trigger trg_documents_mark_scores_stale
  after update of evidence_status on documents
  for each row
  when (old.evidence_status is distinct from new.evidence_status)
  execute function public.mark_scores_stale_on_evidence_change();

-- Trigger: mark fsvp_record scoring_result stale when record status changes
create or replace function public.mark_fsvp_record_score_stale()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update scoring_results
  set is_stale = true
  where entity_type = 'fsvp_record' and entity_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_fsvp_record_status_stale on fsvp_records;
create trigger trg_fsvp_record_status_stale
  after update of status on fsvp_records
  for each row
  when (old.status is distinct from new.status)
  execute function public.mark_fsvp_record_score_stale();

-- ============================================================
-- 7. RLS
-- ============================================================
alter table scoring_results        enable row level security;
alter table fsvp_records           enable row level security;
alter table fsvp_record_evidence   enable row level security;
alter table approval_decisions     enable row level security;
alter table reassessment_schedules enable row level security;

-- scoring_results: readable by all authenticated users; writes go through
-- the scoring engine via service role (no authenticated write policy)
create policy scoring_results_read on scoring_results
  for select to authenticated using (true);

-- fsvp_records: importer-scoped; reviewers can read all
create policy fsvp_records_read on fsvp_records
  for select to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or exists (
      select 1 from profiles
      where id = auth.uid() and role::text = 'reviewer'
    )
  );
create policy fsvp_records_write on fsvp_records
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
  );

-- fsvp_record_evidence: follows fsvp_record tenancy
create policy fsvp_record_evidence_read on fsvp_record_evidence
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_records r
      where r.id = fsvp_record_id
        and (
          r.importer_id in (select public.current_importer_ids())
          or exists (select 1 from profiles where id = auth.uid() and role::text = 'reviewer')
        )
    )
  );
create policy fsvp_record_evidence_write on fsvp_record_evidence
  for all to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_records r
      where r.id = fsvp_record_id
        and r.importer_id in (select public.current_importer_ids())
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_records r
      where r.id = fsvp_record_id
        and r.importer_id in (select public.current_importer_ids())
    )
  );

-- approval_decisions: importer-scoped; reviewers can read
create policy approval_decisions_read on approval_decisions
  for select to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or exists (select 1 from profiles where id = auth.uid() and role::text = 'reviewer')
  );
create policy approval_decisions_write on approval_decisions
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
  );

-- reassessment_schedules: importer-scoped; reviewers can read
create policy reassessment_schedules_read on reassessment_schedules
  for select to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or exists (select 1 from profiles where id = auth.uid() and role::text = 'reviewer')
  );
create policy reassessment_schedules_write on reassessment_schedules
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
  );

-- ============================================================
-- 8. updated_at triggers
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['fsvp_records', 'reassessment_schedules'] loop
    execute format(
      'drop trigger if exists trg_%I_updated_at on %I;
       create trigger trg_%I_updated_at before update on %I
       for each row execute function set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;
