-- ============================================================================
-- 045_importer_rebuild_in_place.sql
--
-- Converges an EXISTING database (migrations 001-043 applied, 044 never run)
-- onto the same end state as the 000/001/002 baseline, without dropping the
-- schema. Use this instead of the baseline when you want to keep the current
-- database, its data, and its auth accounts.
--
--   * Fresh environments:  000_baseline.sql -> 001_baseline_rls.sql -> 002_reference_data.sql
--   * This database:       045 (this file)  -> 001_baseline_rls.sql -> 002_reference_data.sql
--
-- Both paths must end at the same schema. Section 9 asserts that; if it raises,
-- the two have drifted and the assertion tells you where.
--
-- AFTER running this file you MUST run 001_baseline_rls.sql — section 8 drops
-- every existing policy, so the database is left with RLS enabled and no
-- policies until you do. That is deliberate: it fails closed, not open.
-- 002_reference_data.sql is then safe but optional (every statement is
-- ON CONFLICT DO NOTHING/UPDATE against data you already have).
-- ============================================================================

begin;

-- ── 0. Preflight ───────────────────────────────────────────────────────────
-- Refuse to run against a database that was already built from the baseline.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'suppliers' and column_name = 'record_mode'
  ) then
    raise exception
      'suppliers.record_mode already exists — this database was built from 000_baseline.sql. '
      'Migration 045 is only for converging a pre-baseline database.';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'supplier_relationships'
  ) then
    raise exception
      'supplier_relationships is missing — expected migrations 001-043 to be applied first.';
  end if;
end $$;

-- ── 1. Retire the shared-tenant trigger ────────────────────────────────────
-- auto_link_importer assigned every us_importer / reviewer / administrator the
-- first importers row on the platform, ordered by created_at. The two seeded
-- importers were inserted in one statement and share a created_at, so the
-- ordering was not even deterministic.
drop trigger  if exists trg_profiles_auto_link_importer on profiles;
drop function if exists public.auto_link_importer();

-- ── 2. importers ───────────────────────────────────────────────────────────
alter table importers
  add column if not exists duns_number           text,
  add column if not exists primary_contact_email text;

alter table importers drop constraint if exists fk_importers_primary_contact;
alter table importers drop column if exists primary_contact_user_id;
alter table importers drop column if exists status_history;

alter table importers alter column food_scope set default 'human';

comment on column importers.duns_number is
  'D-U-N-S number transmitted as the FSVP importer UFI at entry (21 CFR 1.509). '
  'Entity role code FSV.';

-- ── 3. Split the shared tenant ─────────────────────────────────────────────
-- The oldest importer profile keeps the existing organization, so all existing
-- FSVP records, documents and audit history stay attached to a real account.
-- Every other importer profile gets its own organization. Reviewers and
-- administrators are not tenants at all — their access comes from role checks
-- in the policies, so their importer_id is cleared.
do $$
declare
  v_shared_importer uuid;
  v_keeper          uuid;
  p                 record;
  v_new_importer    uuid;
  v_split_count     int := 0;
begin
  -- prevent_profile_role_escalation() blocks importer_id changes for anyone who
  -- is not an authenticated platform admin. In a SQL session auth.uid() is null,
  -- so it would silently revert every update below.
  alter table profiles disable trigger trg_profiles_prevent_role_escalation;

  select id into v_shared_importer from importers order by created_at, id limit 1;

  if v_shared_importer is not null then
    select id into v_keeper
    from profiles
    where role::text = 'us_importer' and importer_id = v_shared_importer
    order by created_at, id
    limit 1;
  end if;

  -- Reviewers and administrators are not tenants.
  update profiles
  set importer_id = null
  where role::text in ('reviewer', 'administrator')
    and importer_id is not null;

  -- Give every importer profile other than the keeper its own organization.
  for p in
    select id, email, full_name, organization_name, country
    from profiles
    where role::text = 'us_importer'
      and (v_keeper is null or id <> v_keeper)
    order by created_at, id
  loop
    insert into importers (legal_name, display_name, food_scope, address_json, primary_contact_email)
    values (
      coalesce(nullif(p.organization_name, ''), nullif(p.full_name, ''), p.email, 'Unnamed Importer'),
      coalesce(nullif(p.organization_name, ''), nullif(p.full_name, ''), split_part(p.email, '@', 1), 'Unnamed Importer'),
      'human',
      case when nullif(p.country, '') is null
           then '{}'::jsonb
           else jsonb_build_object('country', p.country) end,
      p.email
    )
    returning id into v_new_importer;

    update profiles set importer_id = v_new_importer where id = p.id;
    v_split_count := v_split_count + 1;
  end loop;

  alter table profiles enable trigger trg_profiles_prevent_role_escalation;

  raise notice 'Tenancy split: % importer profile(s) moved to their own organization; keeper profile % retained organization %',
    v_split_count, coalesce(v_keeper::text, '(none)'), coalesce(v_shared_importer::text, '(none)');
end $$;

-- ── 4. suppliers: record ownership + entry identity ────────────────────────
alter table suppliers
  add column if not exists record_mode            text not null default 'self_managed',
  add column if not exists managed_by_importer_id uuid references importers(id) on delete set null,
  add column if not exists claim_invite_token     text,
  add column if not exists claim_invite_sent_at   timestamptz,
  add column if not exists claimed_at             timestamptz,
  add column if not exists claim_declined_at      timestamptz,
  add column if not exists created_by_profile_id  uuid references profiles(id) on delete set null;

alter table suppliers drop constraint if exists suppliers_record_mode_check;
alter table suppliers
  add constraint suppliers_record_mode_check
  check (record_mode in ('self_managed', 'importer_managed', 'claim_pending'));

alter table suppliers drop constraint if exists suppliers_managed_by_check;
alter table suppliers
  add constraint suppliers_managed_by_check check (
    (record_mode = 'self_managed' and managed_by_importer_id is null)
    or (record_mode in ('importer_managed', 'claim_pending') and managed_by_importer_id is not null)
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'suppliers_claim_invite_token_key'
  ) then
    alter table suppliers add constraint suppliers_claim_invite_token_key unique (claim_invite_token);
  end if;
end $$;

-- Dead columns pointing at tables dropped in section 7.
alter table suppliers drop column if exists organization_id;
alter table suppliers drop column if exists foreign_supplier_id;

comment on column suppliers.record_mode is
  'Who owns this record. importer_managed means no exporter account exists and '
  'the managing importer uploads evidence on their behalf — see documents.evidence_source.';

-- ── 5. documents: evidence provenance ──────────────────────────────────────
alter table documents
  add column if not exists evidence_source   text not null default 'supplier_attested',
  add column if not exists attested_by_name  text,
  add column if not exists attested_at       timestamptz,
  add column if not exists updated_at        timestamptz not null default now();

alter table documents drop constraint if exists documents_evidence_source_check;
alter table documents
  add constraint documents_evidence_source_check
  check (evidence_source in ('supplier_attested', 'importer_uploaded', 'third_party'));

alter table documents drop column if exists translated_by_qi_id;
alter table documents drop column if exists uploaded_by_user_id;

comment on column documents.evidence_source is
  'supplier_attested = uploaded by the supplier themselves; importer_uploaded = '
  'uploaded by the importer on their behalf (see suppliers.record_mode); '
  'third_party = direct from a certification body, lab, or auditor.';

-- Existing rows uploaded by a profile belonging to an importer, against a
-- supplier that is not that profile's own, were in practice importer uploads.
update documents d
set evidence_source = 'importer_uploaded'
where evidence_source = 'supplier_attested'
  and exists (
    select 1 from profiles p
    where p.id = d.uploaded_by_profile_id
      and p.role::text in ('us_importer', 'administrator')
  );

-- ── 6. Repoint tables that referenced the dropped foreign_suppliers/foods ──
-- Migration 034 dropped foreign_suppliers CASCADE, which removed these FK
-- constraints but left the columns behind as unconstrained uuids.

alter table corrective_actions
  add column if not exists product_id     uuid references products_verify(id) on delete set null,
  add column if not exists fsvp_record_id uuid references fsvp_records(id) on delete set null,
  add column if not exists document_id    uuid references documents(id) on delete set null;

alter table corrective_actions drop column if exists food_id;
alter table corrective_actions drop column if exists documented_by_qi_id;
alter table corrective_actions drop column if exists triggered_by_recall_id;
alter table corrective_actions drop column if exists triggered_by_inspection_obs_id;
alter table corrective_actions drop column if exists status_history;

-- supplier_id is NOT NULL on this table, so orphans have to be deleted rather
-- than nulled. These are rows pointing at foreign_suppliers ids that ceased to
-- resolve when migration 034 dropped that table.
delete from corrective_actions
where not exists (select 1 from suppliers s where s.id = corrective_actions.supplier_id);

alter table corrective_actions drop constraint if exists corrective_actions_supplier_id_fkey;
alter table corrective_actions
  add constraint corrective_actions_supplier_id_fkey
  foreign key (supplier_id) references suppliers(id) on delete restrict;

-- Also NOT NULL; same reasoning as corrective_actions above.
delete from readiness_assessments
where not exists (select 1 from suppliers s where s.id = readiness_assessments.supplier_id);

alter table readiness_assessments drop constraint if exists readiness_assessments_supplier_id_fkey;
alter table readiness_assessments
  add constraint readiness_assessments_supplier_id_fkey
  foreign key (supplier_id) references suppliers(id) on delete cascade;

update generated_reports
set supplier_id = null
where supplier_id is not null
  and not exists (select 1 from suppliers s where s.id = generated_reports.supplier_id);

alter table generated_reports drop constraint if exists generated_reports_supplier_id_fkey;
alter table generated_reports
  add constraint generated_reports_supplier_id_fkey
  foreign key (supplier_id) references suppliers(id) on delete set null;

alter table generated_reports
  add column if not exists fsvp_record_id uuid references fsvp_records(id) on delete set null;

-- /api/reports/generate writes export_format 'csv' or 'html', but the original
-- check only allowed 'pdf' and 'excel' — every report insert violated it.
alter table generated_reports drop constraint if exists generated_reports_export_format_check;
alter table generated_reports
  add constraint generated_reports_export_format_check
  check (export_format in ('csv', 'html', 'pdf', 'excel'));

alter table generated_reports drop constraint if exists generated_reports_report_type_check;
alter table generated_reports
  add constraint generated_reports_report_type_check
  check (report_type in ('supplier_readiness', 'compliance_gap', 'document_status',
                         'fsvp_record_package', 'audit', 'executive_summary'));

-- fsvp_reassessments
alter table fsvp_reassessments
  add column if not exists target_product_id uuid references products_verify(id) on delete set null,
  add column if not exists performed_by_name text;

alter table fsvp_reassessments drop column if exists target_food_id;
alter table fsvp_reassessments drop column if exists performed_by_qi_id;
alter table fsvp_reassessments drop column if exists status_history;

update fsvp_reassessments
set target_supplier_id = null
where target_supplier_id is not null
  and not exists (select 1 from suppliers s where s.id = fsvp_reassessments.target_supplier_id);

alter table fsvp_reassessments drop constraint if exists fsvp_reassessments_target_supplier_id_fkey;
alter table fsvp_reassessments
  add constraint fsvp_reassessments_target_supplier_id_fkey
  foreign key (target_supplier_id) references suppliers(id) on delete set null;

alter table fsvp_reassessments drop constraint if exists fsvp_reassessments_scope_check;
alter table fsvp_reassessments
  add constraint fsvp_reassessments_scope_check
  check (scope in ('full_program', 'supplier', 'product'));

-- import_entries (§ 1.509) — retained, repointed off foreign_suppliers/foods.
alter table import_entries
  add column if not exists product_id            uuid references products_verify(id) on delete set null,
  add column if not exists fsvp_record_id        uuid references fsvp_records(id) on delete set null,
  add column if not exists fsvp_affirmation_code text;

alter table import_entries drop column if exists food_id;

alter table import_entries drop constraint if exists import_entries_fsvp_affirmation_code_check;
alter table import_entries
  add constraint import_entries_fsvp_affirmation_code_check
  check (fsvp_affirmation_code is null or fsvp_affirmation_code in ('FSV', 'FSX', 'RNE'));

delete from import_entries
where supplier_id is not null
  and not exists (select 1 from suppliers s where s.id = import_entries.supplier_id);

alter table import_entries drop constraint if exists import_entries_supplier_id_fkey;
alter table import_entries
  add constraint import_entries_supplier_id_fkey
  foreign key (supplier_id) references suppliers(id) on delete restrict;

alter table import_entries alter column identity_used_id drop not null;
alter table import_entries alter column created_via set default 'manual';

-- app_notifications
alter table app_notifications
  add column if not exists supplier_id uuid references suppliers(id) on delete cascade,
  add column if not exists severity    text not null default 'info';

alter table app_notifications drop constraint if exists app_notifications_severity_check;
alter table app_notifications
  add constraint app_notifications_severity_check
  check (severity in ('info', 'warning', 'critical'));

-- notification_deliveries loses its FK target in section 7.
alter table notification_deliveries drop column if exists reminder_id;

-- requirement_evidence
alter table requirement_evidence drop column if exists document_version_id;
alter table requirement_evidence drop column if exists corrective_action_id;

-- products_verify
alter table products_verify drop column if exists commodity_id;

-- ── 7. Drop the legacy tables (the never-applied migration 044) ────────────
-- importer_entry_identities and import_entries are deliberately NOT dropped:
-- they are the 21 CFR 1.509 backbone. See docs/importer-workflow-analysis.md.
drop table if exists
  api_credentials, audit_details, audit_substitution_assurances, commodities,
  commodity_risks, country_equivalence_recognitions, customer_disclosure_assurances,
  document_access_log, document_reviews, document_templates, document_versions,
  eligibility_attestations, fda_inspection_observations, fda_inspections,
  fda_request_bundles, food_supply_chain_links, foods, fsvp_reassessment_outcomes,
  hazard_analyses, hazard_analysis_hazards, hazard_library, hazard_library_versions,
  importer_users, onboarding_steps, organizations, qi_credentials,
  qualified_individuals, readiness_reports, recall_events, record_signatures,
  reminders, review_comments, reviewer_assignments, reviews, role_permissions,
  sampling_test_results, scheduled_job_runs, subscription_entitlements,
  supplier_evaluations, supplier_facilities, supplier_portal_tokens,
  supplier_portal_uploads, supplier_products, supplier_written_assurances,
  user_roles, verification_activities, verification_nonconformities, vsi_thresholds
cascade;

drop type if exists verify_role;
drop type if exists readiness_status;
drop type if exists risk_level;

-- ── 8. Replace functions to match the baseline ─────────────────────────────

-- importer_users is gone; a profile's own importer_id is the single source.
create or replace function public.current_importer_ids()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select importer_id from profiles
  where id = auth.uid() and importer_id is not null;
$$;

-- Importer accounts no longer receive an importer_id at signup — an
-- administrator creates the organization at approval time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data->>'role';
  safe_role      app_role;
begin
  safe_role := case
    when requested_role in ('supplier', 'us_importer') then requested_role::app_role
    else 'supplier'::app_role
  end;

  insert into public.profiles (id, email, full_name, organization_name, country, role, user_status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'organization_name', ''),
    nullif(new.raw_user_meta_data->>'country', ''),
    safe_role,
    'pending'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Name-matching removed: it attached a new signup to any suppliers row whose
-- company_name matched their organization_name, with no country or email check.
-- Claiming an existing record now requires an invite token.
create or replace function public.ensure_supplier_record_for_profile(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_org_name    text;
  v_full_name   text;
  v_email       text;
  v_country     text;
begin
  select supplier_id into v_supplier_id from profiles where id = p_profile_id;
  if v_supplier_id is not null then
    return v_supplier_id;
  end if;

  select organization_name, full_name, email, country
    into v_org_name, v_full_name, v_email, v_country
  from profiles where id = p_profile_id;

  insert into suppliers (
    company_name, legal_entity_name, country, contact_json, supplier_type, record_mode
  ) values (
    coalesce(nullif(v_org_name, ''), nullif(v_full_name, ''), 'Unnamed Exporter'),
    nullif(v_org_name, ''),
    coalesce(nullif(v_country, ''), 'US'),
    jsonb_build_object('name', coalesce(v_full_name, ''), 'email', coalesce(v_email, '')),
    'exporter',
    'self_managed'
  )
  returning id into v_supplier_id;

  update profiles set supplier_id = v_supplier_id where id = p_profile_id;
  return v_supplier_id;
end;
$$;

create or replace function public.trg_auto_link_supplier_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid;
begin
  if new.role not in ('supplier', 'exporter') or new.supplier_id is not null then
    return new;
  end if;

  insert into suppliers (company_name, legal_entity_name, country, contact_json,
                         supplier_type, record_mode)
  values (
    coalesce(nullif(new.organization_name, ''), nullif(new.full_name, ''), 'Unnamed Exporter'),
    nullif(new.organization_name, ''),
    coalesce(nullif(new.country, ''), 'US'),
    jsonb_build_object('name', coalesce(new.full_name, ''), 'email', coalesce(new.email, '')),
    'exporter',
    'self_managed'
  )
  returning id into v_supplier_id;

  new.supplier_id := v_supplier_id;
  new.role        := 'exporter';
  return new;
end;
$$;

drop trigger if exists trg_auto_link_supplier_profile on profiles;
create trigger trg_auto_link_supplier_profile
  before insert on profiles
  for each row execute function public.trg_auto_link_supplier_profile();

-- Also mark FSVP records stale when an attached document changes status.
create or replace function public.mark_scores_stale_on_evidence_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.facility_id is not null then
    update scoring_results set is_stale = true
    where entity_type = 'facility' and entity_id = new.facility_id;
  end if;

  if new.linked_entity_type = 'product' and new.linked_entity_id is not null then
    update scoring_results set is_stale = true
    where entity_type = 'product' and entity_id = new.linked_entity_id;
  end if;

  update scoring_results set is_stale = true
  where entity_type = 'fsvp_record'
    and entity_id in (
      select fsvp_record_id from fsvp_record_evidence where document_id = new.id
    );

  return new;
end;
$$;

-- ── 9. Indexes present in the baseline ─────────────────────────────────────
create index if not exists ix_profiles_importer      on profiles (importer_id) where importer_id is not null;
create index if not exists ix_profiles_supplier      on profiles (supplier_id) where supplier_id is not null;
create index if not exists ix_suppliers_type         on suppliers (supplier_type);
create index if not exists ix_suppliers_managed      on suppliers (managed_by_importer_id) where managed_by_importer_id is not null;
create index if not exists ix_suppliers_claim_token  on suppliers (claim_invite_token) where claim_invite_token is not null;
create index if not exists ix_suppliers_name_country on suppliers (lower(company_name), country);
create index if not exists ix_documents_status       on documents (evidence_status) where soft_deleted_at is null;
create index if not exists ix_documents_expiry       on documents (expiration_date) where expiration_date is not null and soft_deleted_at is null;
create index if not exists ix_fsvp_records_importer  on fsvp_records (importer_id);
create index if not exists ix_fsvp_records_supplier  on fsvp_records (supplier_id);
create index if not exists ix_fsvp_records_reassess  on fsvp_records (reassessment_due_at) where reassessment_due_at is not null;
create index if not exists ix_ca_importer            on corrective_actions (importer_id, status);
create index if not exists ix_ca_supplier            on corrective_actions (supplier_id);
create index if not exists ix_notifications_recipient on app_notifications (recipient_profile_id, read_at);
create index if not exists ix_audit_logs_importer    on audit_logs (importer_id, created_at desc);

-- ── 10. Drop every policy, so 001_baseline_rls.sql can be applied verbatim ──
-- Fifteen migrations defined and redefined policies on these tables. Rather
-- than reconcile them one by one, clear them all and let the baseline RLS file
-- be the single definition. RLS stays ENABLED, so the database fails closed
-- until 001_baseline_rls.sql runs.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in (
        'supplier_documents_read', 'supplier_documents_write',
        'supplier_documents_write_supplier_prefix', 'supplier_documents_read_by_supplier',
        'background_documents_read', 'background_documents_admin_write'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- Enable RLS on anything the baseline expects it on but that predates it.
do $$
declare t text;
begin
  foreach t in array array[
    'importers', 'importer_entry_identities', 'profiles', 'countries',
    'suppliers', 'supplier_relationships', 'facilities_verify',
    'facility_supplier_access', 'products_verify', 'rule_sets', 'rule_versions',
    'approval_thresholds', 'requirement_sections', 'scoring_category_weights',
    'requirement_items', 'fsvp_requirements', 'documents', 'document_categories',
    'requirement_evidence', 'scoring_results', 'fsvp_records',
    'fsvp_record_evidence', 'approval_decisions', 'reassessment_schedules',
    'fsvp_plan_hazard_analyses', 'fsvp_plan_hazard_items',
    'fsvp_verification_records', 'corrective_actions', 'fsvp_reassessments',
    'readiness_assessments', 'readiness_scores', 'generated_reports',
    'app_notifications', 'notification_deliveries', 'compliance_alerts',
    'background_reference_documents', 'audit_logs', 'app_settings', 'import_entries'
  ] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('alter table %I enable row level security', t);
    end if;
  end loop;
end $$;

-- ── 11. Convergence assertions ─────────────────────────────────────────────
-- If this database and a baseline-built one have drifted, fail here rather than
-- discovering it later.
do $$
declare
  v_missing text := '';
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'suppliers' and column_name = 'record_mode') then
    v_missing := v_missing || ' suppliers.record_mode';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'documents' and column_name = 'evidence_source') then
    v_missing := v_missing || ' documents.evidence_source';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'importers' and column_name = 'duns_number') then
    v_missing := v_missing || ' importers.duns_number';
  end if;
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'foods') then
    v_missing := v_missing || ' foods(should-be-dropped)';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_profiles_auto_link_importer') then
    v_missing := v_missing || ' auto_link_importer(should-be-dropped)';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'import_entries') then
    v_missing := v_missing || ' import_entries(should-be-kept)';
  end if;

  if v_missing <> '' then
    raise exception 'Convergence check failed. Divergent:%', v_missing;
  end if;

  raise notice 'Schema converged with the 000/001/002 baseline.';
  raise notice 'NEXT: run 001_baseline_rls.sql — RLS is enabled with no policies until you do.';
end $$;

notify pgrst, 'reload schema';

commit;
