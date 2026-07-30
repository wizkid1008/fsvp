-- ============================================================================
-- 045_importer_rebuild_in_place.sql
--
-- Converges an EXISTING database onto the same end state as the 000/001/002
-- baseline, without dropping the schema. Use this when you want to keep the
-- current database, its data, and its auth accounts.
--
--   * Fresh environments:  migrations/000_baseline.sql -> 001_baseline_rls.sql -> 002_reference_data.sql
--   * This database:       upgrade/045 (this file)     -> 001_baseline_rls.sql -> 002_reference_data.sql
--
-- EXISTENCE-TOLERANT BY DESIGN. This database's migration history is partial —
-- migration 037 exists solely because 019 "never actually ran against this
-- database", and import_entries turned out to be absent despite migration 008
-- creating it. So every statement here tolerates its target being missing:
-- tables are created if absent, altered with ALTER TABLE IF EXISTS, and all DML
-- and index creation is guarded with to_regclass().
--
-- Section 12 reports (as warnings, not errors) any baseline table this database
-- still lacks, so you know what to backfill from 000_baseline.sql.
--
-- AFTER running this file you MUST run migrations/001_baseline_rls.sql —
-- section 11 drops every policy, leaving RLS enabled with none defined. That is
-- deliberate: it fails closed, not open.
-- ============================================================================

begin;

-- ── 0. Preflight ───────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'suppliers' and column_name = 'record_mode'
  ) then
    raise exception
      'suppliers.record_mode already exists — this database was already converged, '
      'or was built from 000_baseline.sql. Nothing to do.';
  end if;

  if to_regclass('public.suppliers') is null then
    raise exception 'suppliers table is missing — this does not look like a ThrushCross database.';
  end if;
end $$;

-- ── 1. Retire the shared-tenant trigger ────────────────────────────────────
-- auto_link_importer assigned every us_importer / reviewer / administrator the
-- first importers row on the platform, ordered by created_at. The seeded
-- importers were inserted in one statement and share a created_at, so the
-- ordering was not even deterministic.
drop trigger  if exists trg_profiles_auto_link_importer on profiles;
drop function if exists public.auto_link_importer();

-- ── 2. importers ───────────────────────────────────────────────────────────
alter table if exists importers
  add column if not exists duns_number           text,
  add column if not exists primary_contact_email text;

alter table if exists importers drop constraint if exists fk_importers_primary_contact;
alter table if exists importers drop column if exists primary_contact_user_id;
alter table if exists importers drop column if exists status_history;

comment on column importers.duns_number is
  'D-U-N-S number transmitted as the FSVP importer UFI at entry (21 CFR 1.509). '
  'Entity role code FSV.';

-- ── 3. Split the shared tenant ─────────────────────────────────────────────
-- The oldest importer profile keeps the existing organization, so all existing
-- FSVP records, documents and audit history stay attached to a real account.
-- Every other importer profile gets its own. Reviewers and administrators are
-- not tenants — their access comes from role checks in the policies.
do $$
declare
  v_shared_importer uuid;
  v_keeper          uuid;
  p                 record;
  v_new_importer    uuid;
  v_split_count     int := 0;
  v_has_guard       boolean;
begin
  -- prevent_profile_role_escalation() blocks importer_id changes for anyone who
  -- is not an authenticated platform admin. In a SQL session auth.uid() is null,
  -- so it would silently revert every update below.
  select exists (select 1 from pg_trigger where tgname = 'trg_profiles_prevent_role_escalation')
    into v_has_guard;
  if v_has_guard then
    alter table profiles disable trigger trg_profiles_prevent_role_escalation;
  end if;

  select id into v_shared_importer from importers order by created_at, id limit 1;

  if v_shared_importer is not null then
    select id into v_keeper
    from profiles
    where role::text = 'us_importer' and importer_id = v_shared_importer
    order by created_at, id
    limit 1;
  end if;

  update profiles
  set importer_id = null
  where role::text in ('reviewer', 'administrator')
    and importer_id is not null;

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

  if v_has_guard then
    alter table profiles enable trigger trg_profiles_prevent_role_escalation;
  end if;

  raise notice 'Tenancy split: % importer profile(s) moved to their own organization; keeper % retained organization %',
    v_split_count, coalesce(v_keeper::text, '(none)'), coalesce(v_shared_importer::text, '(none)');
end $$;

-- ── 3b. Report organizations that own data but have no users ───────────────
-- The seeded GreenPath / Pacific Coast organizations were never attached to any
-- profile — everyone signed up onto the single shared organization instead. Any
-- FSVP records or documents sitting under an unattached organization become
-- reachable only by administrators after the split. This is informational; the
-- fix is a deliberate reassignment, not something to guess at.
do $$
declare r record;
begin
  for r in
    select i.id, i.display_name,
           (select count(*) from fsvp_records f where f.importer_id = i.id) as records,
           (select count(*) from documents d where d.importer_id = i.id)    as docs
    from importers i
    where not exists (select 1 from profiles p where p.importer_id = i.id)
  loop
    if r.records > 0 or r.docs > 0 then
      raise warning 'Organization "%" (%) has % FSVP record(s) and % document(s) but NO user accounts. Reassign or ignore.',
        r.display_name, r.id, r.records, r.docs;
    else
      raise notice 'Organization "%" (%) is empty and unused.', r.display_name, r.id;
    end if;
  end loop;
end $$;

-- ── 4. suppliers: record ownership + entry identity ────────────────────────
alter table if exists suppliers
  add column if not exists record_mode            text not null default 'self_managed',
  add column if not exists managed_by_importer_id uuid references importers(id) on delete set null,
  add column if not exists claim_invite_token     text,
  add column if not exists claim_invite_sent_at   timestamptz,
  add column if not exists claimed_at             timestamptz,
  add column if not exists claim_declined_at      timestamptz,
  add column if not exists created_by_profile_id  uuid references profiles(id) on delete set null,
  -- Added by migrations 027/030/043; absent if those never ran here.
  add column if not exists supplier_type          text not null default 'manufacturer',
  add column if not exists portal_status          text not null default 'active',
  add column if not exists readiness_score        numeric(5,2),
  add column if not exists last_reviewed_at       timestamptz,
  add column if not exists duns_number            text,
  add column if not exists ufi_number             text,
  add column if not exists fsvp_identifier        text;

alter table if exists suppliers drop constraint if exists suppliers_supplier_type_check;
alter table if exists suppliers
  add constraint suppliers_supplier_type_check
  check (supplier_type in ('exporter', 'exporter_manufacturer', 'manufacturer', 'trader', 'broker'));

alter table if exists suppliers drop constraint if exists suppliers_record_mode_check;
alter table if exists suppliers
  add constraint suppliers_record_mode_check
  check (record_mode in ('self_managed', 'importer_managed', 'claim_pending'));

alter table if exists suppliers drop constraint if exists suppliers_managed_by_check;
alter table if exists suppliers
  add constraint suppliers_managed_by_check check (
    (record_mode = 'self_managed' and managed_by_importer_id is null)
    or (record_mode in ('importer_managed', 'claim_pending') and managed_by_importer_id is not null)
  );

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_claim_invite_token_key') then
    alter table suppliers add constraint suppliers_claim_invite_token_key unique (claim_invite_token);
  end if;
  -- Suppliers are shared entities, not importer-owned.
  if exists (
    select 1 from information_schema.columns
    where table_name = 'suppliers' and column_name = 'importer_id' and is_nullable = 'NO'
  ) then
    alter table suppliers alter column importer_id drop not null;
  end if;
end $$;

alter table if exists suppliers drop column if exists organization_id;
alter table if exists suppliers drop column if exists foreign_supplier_id;

comment on column suppliers.record_mode is
  'Who owns this record. importer_managed means no exporter account exists and '
  'the managing importer uploads evidence on their behalf — see documents.evidence_source.';

-- ── 5. documents: evidence provenance ──────────────────────────────────────
alter table if exists documents
  add column if not exists evidence_source        text not null default 'supplier_attested',
  add column if not exists attested_by_name       text,
  add column if not exists attested_at            timestamptz,
  add column if not exists updated_at             timestamptz not null default now(),
  add column if not exists supplier_id            uuid references suppliers(id) on delete set null,
  add column if not exists expiration_date        date,
  add column if not exists uploaded_by_profile_id uuid references profiles(id) on delete set null,
  add column if not exists evidence_status        text not null default 'not_submitted';

alter table if exists documents drop constraint if exists documents_evidence_source_check;
alter table if exists documents
  add constraint documents_evidence_source_check
  check (evidence_source in ('supplier_attested', 'importer_uploaded', 'third_party'));

alter table if exists documents drop column if exists translated_by_qi_id;
alter table if exists documents drop column if exists uploaded_by_user_id;

do $$
begin
  if to_regclass('public.facilities_verify') is not null then
    alter table documents add column if not exists facility_id uuid references facilities_verify(id) on delete set null;
  end if;
  if to_regclass('public.requirement_items') is not null then
    alter table documents add column if not exists requirement_item_id uuid references requirement_items(id) on delete set null;
  end if;
  if to_regclass('public.rule_versions') is not null then
    alter table documents add column if not exists rule_version_id uuid references rule_versions(id) on delete set null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_name = 'documents' and column_name = 'importer_id' and is_nullable = 'NO'
  ) then
    alter table documents alter column importer_id drop not null;
  end if;
end $$;

comment on column documents.evidence_source is
  'supplier_attested = uploaded by the supplier themselves; importer_uploaded = '
  'uploaded by the importer on their behalf (see suppliers.record_mode); '
  'third_party = direct from a certification body, lab, or auditor.';

-- Rows uploaded by an importer-side profile were in practice importer uploads.
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
do $$
begin

  -- corrective_actions -----------------------------------------------------
  if to_regclass('public.corrective_actions') is not null then
    if to_regclass('public.products_verify') is not null then
      alter table corrective_actions add column if not exists product_id uuid references products_verify(id) on delete set null;
    end if;
    if to_regclass('public.fsvp_records') is not null then
      alter table corrective_actions add column if not exists fsvp_record_id uuid references fsvp_records(id) on delete set null;
    end if;
    alter table corrective_actions add column if not exists document_id uuid references documents(id) on delete set null;

    alter table corrective_actions drop column if exists food_id;
    alter table corrective_actions drop column if exists documented_by_qi_id;
    alter table corrective_actions drop column if exists triggered_by_recall_id;
    alter table corrective_actions drop column if exists triggered_by_inspection_obs_id;
    alter table corrective_actions drop column if exists status_history;

    -- supplier_id is NOT NULL here, so orphans must be deleted rather than nulled.
    delete from corrective_actions
    where not exists (select 1 from suppliers s where s.id = corrective_actions.supplier_id);

    alter table corrective_actions drop constraint if exists corrective_actions_supplier_id_fkey;
    alter table corrective_actions
      add constraint corrective_actions_supplier_id_fkey
      foreign key (supplier_id) references suppliers(id) on delete restrict;
  end if;

  -- readiness_assessments --------------------------------------------------
  if to_regclass('public.readiness_assessments') is not null then
    delete from readiness_assessments
    where not exists (select 1 from suppliers s where s.id = readiness_assessments.supplier_id);

    alter table readiness_assessments drop constraint if exists readiness_assessments_supplier_id_fkey;
    alter table readiness_assessments
      add constraint readiness_assessments_supplier_id_fkey
      foreign key (supplier_id) references suppliers(id) on delete cascade;
  end if;

  -- generated_reports ------------------------------------------------------
  if to_regclass('public.generated_reports') is not null then
    update generated_reports
    set supplier_id = null
    where supplier_id is not null
      and not exists (select 1 from suppliers s where s.id = generated_reports.supplier_id);

    alter table generated_reports drop constraint if exists generated_reports_supplier_id_fkey;
    alter table generated_reports
      add constraint generated_reports_supplier_id_fkey
      foreign key (supplier_id) references suppliers(id) on delete set null;

    if to_regclass('public.fsvp_records') is not null then
      alter table generated_reports add column if not exists fsvp_record_id uuid references fsvp_records(id) on delete set null;
    end if;

    -- /api/reports/generate writes 'csv' or 'html', but the original check only
    -- allowed 'pdf' and 'excel' — every report insert violated it.
    alter table generated_reports drop constraint if exists generated_reports_export_format_check;
    alter table generated_reports
      add constraint generated_reports_export_format_check
      check (export_format in ('csv', 'html', 'pdf', 'excel'));

    alter table generated_reports drop constraint if exists generated_reports_report_type_check;
    alter table generated_reports
      add constraint generated_reports_report_type_check
      check (report_type in ('supplier_readiness', 'compliance_gap', 'document_status',
                             'fsvp_record_package', 'audit', 'executive_summary'));
  end if;

  -- fsvp_reassessments -----------------------------------------------------
  if to_regclass('public.fsvp_reassessments') is not null then
    if to_regclass('public.products_verify') is not null then
      alter table fsvp_reassessments add column if not exists target_product_id uuid references products_verify(id) on delete set null;
    end if;
    alter table fsvp_reassessments add column if not exists performed_by_name text;

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
  end if;

  -- app_notifications ------------------------------------------------------
  if to_regclass('public.app_notifications') is not null then
    alter table app_notifications
      add column if not exists supplier_id uuid references suppliers(id) on delete cascade,
      add column if not exists severity    text not null default 'info';

    alter table app_notifications drop constraint if exists app_notifications_severity_check;
    alter table app_notifications
      add constraint app_notifications_severity_check
      check (severity in ('info', 'warning', 'critical'));
  end if;

  if to_regclass('public.notification_deliveries') is not null then
    alter table notification_deliveries drop column if exists reminder_id;
  end if;

  if to_regclass('public.requirement_evidence') is not null then
    alter table requirement_evidence drop column if exists document_version_id;
    alter table requirement_evidence drop column if exists corrective_action_id;
  end if;

  if to_regclass('public.products_verify') is not null then
    alter table products_verify drop column if exists commodity_id;
    if to_regclass('public.facilities_verify') is not null then
      alter table products_verify add column if not exists facility_id uuid references facilities_verify(id) on delete set null;
    end if;
  end if;

end $$;

-- ── 7. Tables this database never got ──────────────────────────────────────
-- Confirmed absent by 000_diagnose.sql: app_settings, document_categories and
-- compliance_alerts (migrations 018 and 043 landed only partially), plus
-- import_entries and importer_entry_identities.
--
-- app_settings and document_categories are not cosmetic — /api/documents/upload
-- reads app_settings.auto_generate_audit_events on every upload, and
-- app/evidence/page.tsx reads document_categories to populate its category
-- picker. Both have been failing silently.

create table if not exists app_settings (
  setting_key           text primary key,
  label                 text not null,
  detail                text,
  setting_type          text not null default 'boolean'
                          check (setting_type in ('boolean', 'text', 'number', 'json')),
  boolean_value         boolean,
  text_value            text,
  number_value          numeric,
  json_value            jsonb,
  category              text not null default 'workflow',
  sort_order            int not null default 0,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists document_categories (
  id           uuid primary key default gen_random_uuid(),
  category_key text not null unique,
  label        text not null,
  description  text,
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists compliance_alerts (
  id                     uuid primary key default gen_random_uuid(),
  importer_id            uuid not null references importers(id) on delete cascade,
  fsvp_record_id         uuid references fsvp_records(id) on delete cascade,
  verification_record_id uuid references fsvp_verification_records(id) on delete cascade,
  document_id            uuid references documents(id) on delete cascade,
  alert_type             text not null check (alert_type in (
                           'reassessment_due', 'verification_due', 'document_expiring',
                           'corrective_action_open', 'supplier_approval_due', 'entry_filing_pending'
                         )),
  title                  text not null,
  description            text,
  due_date               date not null,
  severity               text not null default 'medium'
                           check (severity in ('low', 'medium', 'high', 'critical')),
  status                 text not null default 'open'
                           check (status in ('open', 'acknowledged', 'resolved', 'snoozed')),
  snoozed_until          date,
  resolved_at            timestamptz,
  resolved_by_profile_id uuid references profiles(id) on delete set null,
  auto_generated         boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists ix_compliance_alerts_importer_due
  on compliance_alerts (importer_id, due_date)
  where status in ('open', 'acknowledged');

-- § 1.509 entry tables. Retained deliberately even though no UI touches them
-- yet; see docs/importer-workflow-analysis.md §2.
create table if not exists importer_entry_identities (
  id              uuid primary key default gen_random_uuid(),
  importer_id     uuid not null references importers(id) on delete cascade,
  duns_number     text not null,
  contact_email   text not null,
  contact_name    text not null,
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists import_entries (
  id                       uuid primary key default gen_random_uuid(),
  importer_id              uuid not null references importers(id) on delete cascade,
  supplier_id              uuid not null references suppliers(id) on delete restrict,
  identity_used_id         uuid references importer_entry_identities(id) on delete set null,
  entry_number             text,
  entry_date               date,
  port_of_entry            text,
  quantity_text            text,
  declared_value_cents     bigint,
  customs_broker_name      text,
  fsvp_affirmation_code    text check (fsvp_affirmation_code in ('FSV', 'FSX', 'RNE')),
  pre_entry_check_passed   boolean,
  pre_entry_check_blockers jsonb,
  created_via              text not null default 'manual'
                             check (created_via in ('manual', 'broker_import', 'ace_integration')),
  created_at               timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.products_verify') is not null then
    alter table import_entries add column if not exists product_id uuid references products_verify(id) on delete set null;
  end if;
  if to_regclass('public.fsvp_records') is not null then
    alter table import_entries add column if not exists fsvp_record_id uuid references fsvp_records(id) on delete set null;
  end if;

  -- If an older import_entries survived from migration 008, bring it forward.
  if exists (select 1 from information_schema.columns
             where table_name = 'import_entries' and column_name = 'food_id') then
    alter table import_entries add column if not exists fsvp_affirmation_code text;
    alter table import_entries drop column if exists food_id;
    alter table import_entries alter column identity_used_id drop not null;

    delete from import_entries
    where not exists (select 1 from suppliers s where s.id = import_entries.supplier_id);

    alter table import_entries drop constraint if exists import_entries_supplier_id_fkey;
    alter table import_entries
      add constraint import_entries_supplier_id_fkey
      foreign key (supplier_id) references suppliers(id) on delete restrict;

    alter table import_entries drop constraint if exists import_entries_fsvp_affirmation_code_check;
    alter table import_entries
      add constraint import_entries_fsvp_affirmation_code_check
      check (fsvp_affirmation_code is null or fsvp_affirmation_code in ('FSV', 'FSX', 'RNE'));
  end if;
end $$;

-- ── 8. Drop the legacy tables (the never-applied migration 044) ────────────
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
  user_roles, verification_activities, verification_nonconformities, vsi_thresholds,
  importer_supplier_links, exporter_supplier_links
cascade;

drop type if exists verify_role;
drop type if exists readiness_status;
drop type if exists risk_level;

-- ── 9. Replace functions to match the baseline ─────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- importer_users is gone; a profile's own importer_id is the single source.
create or replace function public.current_importer_ids()
returns setof uuid
language sql security definer set search_path = public
as $$
  select importer_id from profiles where id = auth.uid() and importer_id is not null;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'administrator' and user_status = 'active'
  );
$$;

-- Importer accounts no longer receive an importer_id at signup — an
-- administrator creates the organization at approval time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
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

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_platform_admin() then return new; end if;
  new.role        := old.role;
  new.user_status := old.user_status;
  new.importer_id := old.importer_id;
  if old.supplier_id is not null then
    new.supplier_id := old.supplier_id;
  end if;
  return new;
end;
$$;

-- Name-matching removed: it attached a new signup to any suppliers row whose
-- company_name matched their organization_name, with no country or email check.
-- Claiming an existing record now requires an invite token.
create or replace function public.ensure_supplier_record_for_profile(p_profile_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_supplier_id uuid; v_org_name text; v_full_name text; v_email text; v_country text;
begin
  select supplier_id into v_supplier_id from profiles where id = p_profile_id;
  if v_supplier_id is not null then return v_supplier_id; end if;

  select organization_name, full_name, email, country
    into v_org_name, v_full_name, v_email, v_country
  from profiles where id = p_profile_id;

  insert into suppliers (company_name, legal_entity_name, country, contact_json,
                         supplier_type, record_mode)
  values (
    coalesce(nullif(v_org_name, ''), nullif(v_full_name, ''), 'Unnamed Exporter'),
    nullif(v_org_name, ''),
    coalesce(nullif(v_country, ''), 'US'),
    jsonb_build_object('name', coalesce(v_full_name, ''), 'email', coalesce(v_email, '')),
    'exporter', 'self_managed'
  )
  returning id into v_supplier_id;

  update profiles set supplier_id = v_supplier_id where id = p_profile_id;
  return v_supplier_id;
end;
$$;

create or replace function public.trg_auto_link_supplier_profile()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_supplier_id uuid;
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
    'exporter', 'self_managed'
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

create or replace function public.is_export_eligible(p_supplier_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from suppliers
    where id = p_supplier_id
      and supplier_type in ('exporter', 'exporter_manufacturer', 'trader')
  );
$$;

-- Weight validator: exclude by section, not by row id. On INSERT, new.id is a
-- freshly generated uuid that never matches the existing row, so re-seeding the
-- weights counted the section's current weight AND the incoming one and raised
-- "would exceed 100%" against an unchanged configuration. It also blocked any
-- edit through the admin ScoringWeightsEditor for the same reason.
create or replace function public.validate_scoring_weights()
returns trigger
language plpgsql set search_path = public
as $$
declare
  v_applies_to text;
  v_total      numeric;
begin
  select rs.applies_to into v_applies_to
  from requirement_sections rs
  where rs.id = new.section_id;

  select coalesce(sum(w.weight_percent), 0) into v_total
  from scoring_category_weights w
  join requirement_sections s on s.id = w.section_id
  where w.rule_version_id = new.rule_version_id
    and s.applies_to = v_applies_to
    and w.section_id is distinct from new.section_id;

  if v_total + new.weight_percent > 100.001 then
    raise exception
      'Scoring weights for % sections in this rule version would exceed 100%% (current total: %, adding: %)',
      v_applies_to, v_total, new.weight_percent;
  end if;

  return new;
end;
$$;

-- Also mark FSVP records stale when an attached document changes status.
create or replace function public.mark_scores_stale_on_evidence_change()
returns trigger
language plpgsql set search_path = public
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
    and entity_id in (select fsvp_record_id from fsvp_record_evidence where document_id = new.id);

  return new;
end;
$$;

-- ── 9b. updated_at triggers, including on the tables created above ─────────
do $$
declare t text;
begin
  foreach t in array array[
    'importers', 'profiles', 'suppliers', 'supplier_relationships',
    'facilities_verify', 'products_verify', 'documents', 'document_categories',
    'requirement_evidence', 'rule_sets', 'rule_versions', 'fsvp_records',
    'reassessment_schedules', 'fsvp_plan_hazard_analyses', 'fsvp_verification_records',
    'corrective_actions', 'fsvp_reassessments', 'readiness_assessments',
    'compliance_alerts', 'background_reference_documents', 'app_settings', 'countries'
  ] loop
    if to_regclass('public.' || t) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name = 'updated_at'
       ) then
      execute format(
        'drop trigger if exists trg_%I_updated_at on %I;
         create trigger trg_%I_updated_at before update on %I
         for each row execute function public.set_updated_at();',
        t, t, t, t
      );
    end if;
  end loop;
end $$;

-- ── 10. Indexes ────────────────────────────────────────────────────────────
do $$
declare
  stmt  text;
  stmts text[] := array[
    'create index if not exists ix_profiles_importer on profiles (importer_id) where importer_id is not null',
    'create index if not exists ix_profiles_supplier on profiles (supplier_id) where supplier_id is not null',
    'create index if not exists ix_suppliers_type on suppliers (supplier_type)',
    'create index if not exists ix_suppliers_managed on suppliers (managed_by_importer_id) where managed_by_importer_id is not null',
    'create index if not exists ix_suppliers_claim_token on suppliers (claim_invite_token) where claim_invite_token is not null',
    'create index if not exists ix_suppliers_name_country on suppliers (lower(company_name), country)',
    'create index if not exists ix_documents_status on documents (evidence_status) where soft_deleted_at is null',
    'create index if not exists ix_documents_expiry on documents (expiration_date) where expiration_date is not null and soft_deleted_at is null',
    'create index if not exists ix_documents_supplier on documents (supplier_id) where supplier_id is not null and soft_deleted_at is null',
    'create index if not exists ix_fsvp_records_importer on fsvp_records (importer_id)',
    'create index if not exists ix_fsvp_records_supplier on fsvp_records (supplier_id)',
    'create index if not exists ix_fsvp_records_reassess on fsvp_records (reassessment_due_at) where reassessment_due_at is not null',
    'create index if not exists ix_ca_importer on corrective_actions (importer_id, status)',
    'create index if not exists ix_ca_supplier on corrective_actions (supplier_id)',
    'create index if not exists ix_notifications_recipient on app_notifications (recipient_profile_id, read_at)',
    'create index if not exists ix_audit_logs_importer on audit_logs (importer_id, created_at desc)',
    'create index if not exists ix_entries_importer_date on import_entries (importer_id, entry_date desc)',
    'create unique index if not exists ux_importer_current_identity on importer_entry_identities (importer_id) where effective_to is null'
  ];
begin
  foreach stmt in array stmts loop
    begin
      execute stmt;
    exception when undefined_table or undefined_column then
      raise notice 'Skipped index (target missing): %', stmt;
    end;
  end loop;
end $$;

-- ── 11. Drop every policy, so 001_baseline_rls.sql is the single definition ─
-- Fifteen migrations defined and redefined policies on these tables. Rather
-- than reconcile them one by one, clear them all. RLS stays ENABLED, so the
-- database fails closed until 001_baseline_rls.sql runs.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
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
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I enable row level security', t);
    end if;
  end loop;
end $$;

-- ── 12. Report what is still missing versus the baseline ───────────────────
-- Informational, not fatal: this database's migration history is partial, so
-- some baseline tables may never have been created here. Anything listed below
-- must be created from 000_baseline.sql before the related feature will work,
-- and 001_baseline_rls.sql will fail on a missing table until you do.
do $$
declare
  t text;
  v_missing text := '';
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
    if to_regclass('public.' || t) is null then
      v_missing := v_missing || ' ' || t;
    end if;
  end loop;

  if v_missing <> '' then
    raise warning 'MISSING TABLES — this database never created:%', v_missing;
    raise warning 'Create them from migrations/000_baseline.sql before running 001_baseline_rls.sql.';
  else
    raise notice 'All baseline tables present.';
  end if;

  raise notice 'NEXT: run migrations/001_baseline_rls.sql — RLS is enabled with no policies until you do.';
end $$;

notify pgrst, 'reload schema';

commit;
