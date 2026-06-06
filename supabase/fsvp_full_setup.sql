-- FSVP / ThrushCross Verify full Supabase setup SQL
-- Generated from supabase/migrations in lexical order.


-- ============================================================
-- 001_tenancy.sql
-- ============================================================

-- 001_tenancy.sql â€” extensions, helpers, importers, identities, users, role_permissions

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- Importers (tenants)
create table importers (
  id                              uuid primary key default gen_random_uuid(),
  legal_name                      text not null,
  display_name                    text not null,
  ein                             text,
  food_scope                      text not null check (food_scope in ('human','animal','both')),
  timezone                        text not null default 'America/New_York',
  address_json                    jsonb not null,
  primary_contact_user_id         uuid,
  stripe_customer_id              text,
  status                          text not null default 'active'
                                    check (status in ('active','suspended','closed')),
  status_history                  jsonb not null default '[]'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- Effective-dated CBP identity (Â§ 1.509)
create table importer_entry_identities (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  duns_number                     text not null,
  contact_email                   text not null,
  contact_name                    text not null,
  effective_from                  timestamptz not null,
  effective_to                    timestamptz,
  created_at                      timestamptz not null default now()
);
create unique index ux_importer_current_identity
  on importer_entry_identities (importer_id) where effective_to is null;
create index ix_importer_identity_window
  on importer_entry_identities (importer_id, effective_from, effective_to);

create table importer_users (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  clerk_user_id                   text not null,
  email                           text not null,
  full_name                       text,
  role                            text not null check (role in
                                    ('owner','admin','qi','contributor','viewer')),
  qi_id                           uuid,
  invited_at                      timestamptz,
  accepted_at                     timestamptz,
  removed_at                      timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (importer_id, clerk_user_id)
);
create index ix_importer_users_clerk on importer_users (clerk_user_id) where removed_at is null;

alter table importers
  add constraint fk_importers_primary_contact
  foreign key (primary_contact_user_id) references importer_users(id) on delete set null;

create table role_permissions (
  role                            text not null,
  permission                      text not null,
  primary key (role, permission)
);



-- ============================================================
-- 002_qis_eligibility.sql
-- ============================================================

-- 002_qis_eligibility.sql â€” QIs, credentials, VSI thresholds, eligibility attestations

-- Qualified Individuals (Â§ 1.503)
create table qualified_individuals (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  full_name                       text not null,
  email                           text,
  employment_type                 text not null check (employment_type in
                                    ('employee','consultant','third_party')),
  qualifications_text             text not null,
  qi_for_activities               text[] not null,
  active                          boolean not null default true,
  start_date                      date,
  end_date                        date,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

alter table importer_users
  add constraint fk_importer_users_qi
  foreign key (qi_id) references qualified_individuals(id) on delete set null;

-- Per-credential expiry tracking
create table qi_credentials (
  id                              uuid primary key default gen_random_uuid(),
  qi_id                           uuid not null references qualified_individuals(id) on delete cascade,
  importer_id                     uuid not null references importers(id) on delete cascade,
  credential_name                 text not null,
  issuing_body                    text,
  issued_on                       date,
  expires_on                      date,
  document_id                     uuid,   -- FK added in 008
  created_at                      timestamptz not null default now()
);
create index ix_qi_credentials_expiry
  on qi_credentials (importer_id, expires_on) where expires_on is not null;

-- VSI threshold reference (inflation-adjusted from 2011 baseline)
create table vsi_thresholds (
  effective_year                  int primary key,
  human_food_cents                bigint not null,
  animal_food_cents               bigint not null,
  source_citation                 text
);

-- Annual VSI eligibility self-documentation (Â§ 1.512(b)(1))
create table eligibility_attestations (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  attestation_year                int not null,
  sales_lookback_start_year       int not null,
  sales_lookback_end_year         int not null,
  human_food_avg_annual_sales_cents  bigint,
  animal_food_avg_annual_sales_cents bigint,
  threshold_human_cents_used      bigint not null,
  threshold_animal_cents_used     bigint not null,
  qualifies_as_vsi                boolean not null,
  attested_by_user_id             uuid not null references importer_users(id),
  attested_at                     timestamptz not null,
  supporting_docs_note            text,
  created_at                      timestamptz not null default now(),
  unique (importer_id, attestation_year)
);

-- Derived view: current-year compliance path per importer
create view importer_effective_path as
  select
    i.id as importer_id,
    coalesce(
      (select case when qualifies_as_vsi then 'vsi' else 'full_fsvp' end
         from eligibility_attestations
         where importer_id = i.id
           and attestation_year = extract(year from now())::int
         order by attested_at desc limit 1),
      'full_fsvp'
    ) as compliance_path
  from importers i;



-- ============================================================
-- 003_suppliers_foods.sql
-- ============================================================

-- 003_suppliers_foods.sql â€” foreign suppliers, foods, supply chain links, food_effective_path view

-- Foreign suppliers (self-referential for supplier-of-supplier chain)
create table foreign_suppliers (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  parent_supplier_id              uuid references foreign_suppliers(id),
  supplier_name                   text not null,
  legal_name                      text,
  ffr_registration_number         text,
  country                         text not null,
  address_json                    jsonb not null,
  contact_name                    text,
  contact_email                   text,
  contact_phone                   text,
  supplier_classification         text not null default 'standard' check (supplier_classification in
                                    ('standard','qualified_facility','small_produce_farm','small_shell_egg_producer')),
  country_equivalence_id          uuid,   -- FK added in 007
  approval_status                 text not null default 'pending' check (approval_status in
                                    ('pending','approved','temporary','suspended','discontinued')),
  approval_status_history         jsonb not null default '[]'::jsonb,
  temporary_approval_until        timestamptz,
  discontinued_at                 timestamptz,
  notes                           text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index ix_suppliers_importer_status on foreign_suppliers (importer_id, approval_status);

-- A "food" = food Ã— supplier combination (FSVP unit)
create table foods (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete restrict,
  food_name                       text not null,
  description                     text,
  fda_product_code                text,
  harmonized_tariff_code          text,
  intended_use                    text check (intended_use in
                                    ('consumer_ready','further_processing','animal_feed','ingredient','other')),
  current_evaluation_id           uuid,   -- FK added in 004
  current_hazard_analysis_id      uuid,   -- FK added in 004
  active                          boolean not null default true,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index ix_foods_importer_supplier_active on foods (importer_id, supplier_id, active);

-- Derived view: per-food applicable FSVP path
create view food_effective_path as
  select
    f.id as food_id,
    f.importer_id,
    case
      when iep.compliance_path = 'vsi'                              then 'vsi_modified'
      when fs.supplier_classification != 'standard'                 then 'small_supplier_modified'
      when fs.country_equivalence_id is not null                    then 'equivalence_reduced'
      else 'full'
    end as applicable_path
  from foods f
    join foreign_suppliers fs on fs.id = f.supplier_id
    join importer_effective_path iep on iep.importer_id = f.importer_id;

-- Per-food controlling party chain (Â§ 1.504(c))
create table food_supply_chain_links (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  food_id                         uuid not null references foods(id) on delete cascade,
  controlling_role                text not null check (controlling_role in
                                    ('foreign_supplier','supplier_of_supplier','importer_customer','importer')),
  controlling_supplier_id         uuid references foreign_suppliers(id),
  hazard_scope_text               text,
  effective_from                  timestamptz not null default now(),
  effective_to                    timestamptz,
  created_at                      timestamptz not null default now()
);
create index ix_food_chain_food on food_supply_chain_links (food_id) where effective_to is null;



-- ============================================================
-- 004_hazard_analyses_evaluations.sql
-- ============================================================

-- 004_hazard_analyses_evaluations.sql â€” hazard analyses, hazards child, supplier evaluations

-- Hazard analyses (Â§ 1.504)
create table hazard_analyses (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  food_id                         uuid not null references foods(id) on delete restrict,
  version                         int not null,
  supersedes_id                   uuid references hazard_analyses(id),
  status                          text not null check (status in ('draft','final','superseded')),
  status_history                  jsonb not null default '[]'::jsonb,
  relied_on_other_party_supplier_id uuid references foreign_suppliers(id),
  relied_on_document_id           uuid,   -- FK added in 008
  reliance_review_qi_id           uuid references qualified_individuals(id),
  methodology_notes               text,
  performed_by_qi_id              uuid references qualified_individuals(id),
  performed_at                    timestamptz,
  next_reassessment_due_at        timestamptz,
  signed_state_sha256             text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (food_id, version)
);

create table hazard_analysis_hazards (
  id                              uuid primary key default gen_random_uuid(),
  hazard_analysis_id              uuid not null references hazard_analyses(id) on delete cascade,
  hazard_type                     text not null check (hazard_type in
                                    ('biological','chemical','radiological','physical')),
  hazard_name                     text not null,
  known_or_reasonably_foreseeable boolean not null,
  requires_control                boolean not null,
  severity                        text check (severity in ('low','moderate','high')),
  probability                     text check (probability in ('low','moderate','high')),
  sahcodha                        boolean not null default false,
  entity_controlling              text check (entity_controlling in
                                    ('foreign_supplier','supplier_of_supplier','importer_customer','importer')),
  controlling_supplier_id         uuid references foreign_suppliers(id),
  controls_in_place               text,
  hazard_library_version_id       uuid   -- FK added in 011
);
create index ix_hazard_analysis_hazards_parent on hazard_analysis_hazards (hazard_analysis_id);

alter table foods
  add constraint fk_foods_current_hazard
  foreign key (current_hazard_analysis_id) references hazard_analyses(id) on delete set null;

-- Supplier evaluations (Â§Â§ 1.505, 1.506)
create table supplier_evaluations (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete restrict,
  food_id                         uuid not null references foods(id) on delete restrict,
  hazard_analysis_id              uuid not null references hazard_analyses(id),
  version                         int not null,
  supersedes_id                   uuid references supplier_evaluations(id),
  status                          text not null check (status in ('draft','final','superseded')),
  status_history                  jsonb not null default '[]'::jsonb,
  hazard_analysis_summary         text,
  entity_controlling_hazard       text not null,
  supplier_compliance_history     text,
  supplier_procedures             text,
  applicable_regs_compliance      text,
  storage_transport_practices     text,
  other_factors                   text,
  approval_decision               text not null check (approval_decision in ('approve','do_not_approve','temporary')),
  approval_rationale              text not null,
  performed_by_qi_id              uuid references qualified_individuals(id),
  performed_at                    timestamptz,
  next_evaluation_due_at          timestamptz,
  signed_state_sha256             text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (supplier_id, food_id, version)
);

alter table foods
  add constraint fk_foods_current_evaluation
  foreign key (current_evaluation_id) references supplier_evaluations(id) on delete set null;



-- ============================================================
-- 005_written_assurances.sql
-- ============================================================

-- 005_written_assurances.sql â€” three regulatory-distinct assurance tables

-- Â§7a Supplier equivalence assurance (VSI Â§ 1.512(b)(3) and small-supplier Â§ 1.512(c))
create table supplier_written_assurances (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete restrict,
  food_id                         uuid references foods(id),
  assurance_basis                 text not null check (assurance_basis in
                                    ('vsi_two_year','qualified_facility_annual',
                                     'small_farm_annual','small_egg_annual')),
  template_id                     uuid,   -- FK added in 011
  status                          text not null check (status in
                                    ('pending_supplier','signed','expired','superseded','revoked')),
  status_history                  jsonb not null default '[]'::jsonb,
  obtained_at                     timestamptz,
  expires_at                      timestamptz not null,
  supersedes_id                   uuid references supplier_written_assurances(id),
  signing_token                   text unique,
  signing_token_expires_at        timestamptz,
  signed_via                      text check (signed_via in
                                    ('tokenized_link','manual_upload','docusign','other')),
  signatory_name                  text,
  signatory_email                 text,
  signatory_title                 text,
  signatory_ip                    inet,
  signed_pdf_document_id          uuid,   -- FK added in 008
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index ix_swa_expiry on supplier_written_assurances (importer_id, expires_at) where status = 'signed';
create unique index ux_swa_active_food
  on supplier_written_assurances (supplier_id, food_id) where status = 'signed' and food_id is not null;
create unique index ux_swa_active_supplier_wide
  on supplier_written_assurances (supplier_id) where status = 'signed' and food_id is null;

-- Â§7b Audit-substitution assurance (Â§ 1.506(d)(2))
create table audit_substitution_assurances (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete restrict,
  food_id                         uuid not null references foods(id) on delete restrict,
  verification_activity_id        uuid,   -- FK added in 006
  status                          text not null check (status in
                                    ('pending_supplier','signed','expired','superseded','revoked')),
  status_history                  jsonb not null default '[]'::jsonb,
  obtained_at                     timestamptz,
  expires_at                      timestamptz not null,
  signing_token                   text unique,
  signing_token_expires_at        timestamptz,
  attests_food_safety_procedures  boolean not null default false,
  attests_monitoring              boolean not null default false,
  attests_corrective_actions      boolean not null default false,
  attests_records_access          boolean not null default false,
  determination_basis_text        text not null,
  determined_by_qi_id             uuid references qualified_individuals(id),
  signed_pdf_document_id          uuid,   -- FK added in 008
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- Â§7c Customer disclosure + assurance (Â§ 1.507)
create table customer_disclosure_assurances (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  food_id                         uuid not null references foods(id) on delete restrict,
  customer_name                   text not null,
  customer_legal_name             text,
  customer_address_json           jsonb,
  customer_contact_email          text,
  disclosure_statement_text       text not null,
  disclosure_sent_at              timestamptz,
  disclosure_method               text check (disclosure_method in
                                    ('label','accompanying_document','electronic')),
  customer_assurance_status       text not null check (customer_assurance_status in
                                    ('pending','received','expired','superseded','revoked')),
  customer_assurance_received_at  timestamptz,
  customer_assurance_expires_at   timestamptz,
  customer_attests_will_control   boolean not null default false,
  pass_through_required           boolean not null default false,
  pass_through_chain_notes        text,
  signing_token                   text unique,
  signed_pdf_document_id          uuid,   -- FK added in 008
  status_history                  jsonb not null default '[]'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);



-- ============================================================
-- 006_verification_corrective_reassessment.sql
-- ============================================================

-- 006_verification_corrective_reassessment.sql â€” verification activities, child detail tables,
-- corrective actions, FSVP reassessments

-- Verification activities (Â§Â§ 1.506â€“1.508)
create table verification_activities (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete restrict,
  food_id                         uuid not null references foods(id) on delete restrict,
  activity_type                   text not null check (activity_type in
                                    ('onsite_audit','sampling_testing','records_review','other')),
  frequency_basis_text            text not null,
  sahcodha_audit_required         boolean not null default false,
  audit_substitution_assurance_id uuid references audit_substitution_assurances(id),
  planned_for_date                date,
  assigned_qi_id                  uuid references qualified_individuals(id),
  next_activity_due_at            timestamptz,
  completed_at                    timestamptz,
  completed_by_qi_id              uuid references qualified_individuals(id),
  result_acceptable               boolean,
  result_summary                  text,
  report_document_id              uuid,   -- FK added in 008
  status                          text not null default 'planned' check (status in
                                    ('planned','in_progress','completed','cancelled','overdue')),
  status_history                  jsonb not null default '[]'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index ix_verification_due
  on verification_activities (importer_id, next_activity_due_at)
  where status in ('planned','in_progress');

alter table audit_substitution_assurances
  add constraint fk_asa_verification
  foreign key (verification_activity_id) references verification_activities(id) on delete set null;

-- Audit detail (1:1 with onsite_audit activities)
create table audit_details (
  verification_activity_id        uuid primary key references verification_activities(id) on delete cascade,
  importer_id                     uuid not null references importers(id) on delete cascade,
  audit_standard                  text,
  audit_scope                     text,
  auditor_name                    text not null,
  auditor_credentials_text        text,
  auditor_independence_basis      text not null,
  audit_started_at                timestamptz,
  audit_ended_at                  timestamptz,
  certificate_number              text,
  findings_critical               int not null default 0,
  findings_major                  int not null default 0,
  findings_minor                  int not null default 0,
  follow_up_audit_required        boolean not null default false,
  follow_up_audit_due_at          timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- Sampling/testing results (many per activity, one per analyte)
create table sampling_test_results (
  id                              uuid primary key default gen_random_uuid(),
  verification_activity_id        uuid not null references verification_activities(id) on delete cascade,
  importer_id                     uuid not null references importers(id) on delete cascade,
  sample_collected_at             timestamptz,
  sample_id                       text,
  analyte                         text not null,
  method                          text not null,
  laboratory_name                 text not null,
  laboratory_iso17025_scope_ref   text,
  result_value                    numeric,
  result_units                    text,
  result_qualitative              text,
  spec_limit                      numeric,
  spec_units                      text,
  pass_fail                       text check (pass_fail in ('pass','fail','inconclusive')),
  coa_document_id                 uuid,   -- FK added in 008
  retention_sample_location       text,
  created_at                      timestamptz not null default now()
);
create index ix_sampling_activity on sampling_test_results (verification_activity_id);

create table verification_nonconformities (
  id                              uuid primary key default gen_random_uuid(),
  verification_activity_id        uuid not null references verification_activities(id) on delete cascade,
  importer_id                     uuid not null references importers(id) on delete cascade,
  description                     text not null,
  severity                        text check (severity in ('minor','major','critical')),
  triggered_corrective_action_id  uuid   -- FK added below
);

-- Corrective actions (Â§ 1.508)
create table corrective_actions (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete restrict,
  food_id                         uuid references foods(id),
  triggered_by                    text not null check (triggered_by in
                                    ('verification_finding','recall','consumer_complaint',
                                     'inspector_finding','reassessment','other')),
  triggered_by_recall_id          uuid,   -- FK added in 007
  triggered_by_inspection_obs_id  uuid,   -- FK added in 007
  triggered_at                    timestamptz not null,
  issue_description               text not null,
  investigation_summary           text,
  action_taken                    text,
  supplier_response               text,
  decision                        text check (decision in
                                    ('continued','temporary_suspension','discontinued')),
  documented_by_qi_id             uuid references qualified_individuals(id),
  closed_at                       timestamptz,
  status                          text not null default 'open' check (status in
                                    ('open','in_progress','closed')),
  status_history                  jsonb not null default '[]'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

alter table verification_nonconformities
  add constraint fk_noncon_corrective_action
  foreign key (triggered_corrective_action_id) references corrective_actions(id) on delete set null;

-- FSVP reassessment (Â§ 1.502(c))
create table fsvp_reassessments (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  scope                           text not null check (scope in ('full_program','supplier','food')),
  target_supplier_id              uuid references foreign_suppliers(id),
  target_food_id                  uuid references foods(id),
  triggered_by                    text not null check (triggered_by in
                                    ('scheduled_3yr','new_hazard_info','supplier_nonconformance',
                                     'regulatory_change','recall','other')),
  findings                        text,
  changes_required                text,
  changes_implemented_at          timestamptz,
  performed_by_qi_id              uuid references qualified_individuals(id),
  performed_at                    timestamptz,
  next_reassessment_due_at        timestamptz,
  status                          text not null default 'in_progress' check (status in
                                    ('in_progress','completed','superseded')),
  status_history                  jsonb not null default '[]'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create table fsvp_reassessment_outcomes (
  id                              uuid primary key default gen_random_uuid(),
  reassessment_id                 uuid not null references fsvp_reassessments(id) on delete cascade,
  outcome_entity_type             text not null,
  outcome_entity_id               uuid not null,
  created_at                      timestamptz not null default now()
);



-- ============================================================
-- 007_recalls_inspections_equivalence.sql
-- ============================================================

-- 007_recalls_inspections_equivalence.sql â€” recalls, FDA inspections, country equivalence

-- Recalls
create table recall_events (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid references foreign_suppliers(id),
  food_id                         uuid references foods(id),
  recall_number                   text,
  recall_classification           text check (recall_classification in ('class_i','class_ii','class_iii')),
  initiation_date                 date,
  source                          text check (source in
                                    ('fda_feed','supplier_notice','customer_complaint','internal','other')),
  scope_description               text not null,
  fei_number                      text,
  status                          text not null default 'open' check (status in
                                    ('open','investigating','closed_terminated','closed_no_action')),
  status_history                  jsonb not null default '[]'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

alter table corrective_actions
  add constraint fk_ca_recall
  foreign key (triggered_by_recall_id) references recall_events(id) on delete set null;

-- FDA inspections
create table fda_inspections (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  inspection_type                 text not null check (inspection_type in
                                    ('fsvp_remote','fsvp_onsite','for_cause','follow_up')),
  fei_number                      text,
  visit_start_date                date,
  visit_end_date                  date,
  lead_investigator_name          text,
  form_482_issued_at              timestamptz,
  form_483_issued_at              timestamptz,
  importer_response_due_at        timestamptz,
  importer_responded_at           timestamptz,
  close_out_letter_received_at    timestamptz,
  eir_received_at                 timestamptz,
  outcome                         text check (outcome in ('nai','vai','oai','other')),
  outcome_summary                 text,
  status                          text not null default 'open' check (status in
                                    ('open','responding','closed')),
  status_history                  jsonb not null default '[]'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create table fda_inspection_observations (
  id                              uuid primary key default gen_random_uuid(),
  inspection_id                   uuid not null references fda_inspections(id) on delete cascade,
  importer_id                     uuid not null references importers(id) on delete cascade,
  observation_number              int,
  observation_text                text not null,
  cfr_citation                    text,
  importer_response_text          text,
  corrective_action_id            uuid references corrective_actions(id),
  created_at                      timestamptz not null default now()
);

alter table corrective_actions
  add constraint fk_ca_inspection_obs
  foreign key (triggered_by_inspection_obs_id) references fda_inspection_observations(id) on delete set null;

-- Country equivalence (Â§ 1.513)
create table country_equivalence_recognitions (
  id                              uuid primary key default gen_random_uuid(),
  country                         text not null,
  food_scope_description          text not null,
  effective_from                  date,
  effective_to                    date,
  source_citation                 text,
  created_at                      timestamptz not null default now()
);

alter table foreign_suppliers
  add constraint fk_supplier_equivalence
  foreign key (country_equivalence_id) references country_equivalence_recognitions(id) on delete set null;



-- ============================================================
-- 008_entries_documents.sql
-- ============================================================

-- 008_entries_documents.sql â€” import entries, document vault (+ all FK backfills),
-- record signatures ledger, document access log

-- Import entries (Â§ 1.509 per-line attestation)
create table import_entries (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id),
  food_id                         uuid not null references foods(id),
  identity_used_id                uuid not null references importer_entry_identities(id),
  entry_number                    text,
  entry_date                      date,
  port_of_entry                   text,
  quantity_text                   text,
  declared_value_cents            bigint,
  customs_broker_name             text,
  pre_entry_check_passed          boolean,
  pre_entry_check_blockers        jsonb,
  created_via                     text not null check (created_via in
                                    ('manual','broker_import','ace_integration')),
  created_at                      timestamptz not null default now()
);
create index ix_entries_importer_date on import_entries (importer_id, entry_date desc);

-- Document vault (polymorphic linked_entity)
create table documents (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  document_kind                   text not null,
  title                           text not null,
  description                     text,
  storage_path                    text not null,
  original_filename               text,
  mime_type                       text not null,
  size_bytes                      bigint not null,
  sha256                          text not null,
  language                        text,
  translated_from_document_id     uuid references documents(id),
  translated_by_qi_id             uuid references qualified_individuals(id),
  linked_entity_type              text,
  linked_entity_id                uuid,
  retention_until                 timestamptz,
  retention_locked                boolean not null default true,
  uploaded_by_user_id             uuid references importer_users(id),
  uploaded_via                    text not null default 'app' check (uploaded_via in
                                    ('app','supplier_portal','broker_api','system')),
  uploaded_at                     timestamptz not null default now(),
  soft_deleted_at                 timestamptz,
  created_at                      timestamptz not null default now()
);
create index ix_documents_importer_kind on documents (importer_id, document_kind);
create index ix_documents_linked on documents (linked_entity_type, linked_entity_id);

-- Backfill all FKs pointing at documents
alter table qi_credentials
  add constraint fk_qi_cred_document foreign key (document_id) references documents(id) on delete set null;
alter table supplier_written_assurances
  add constraint fk_swa_pdf foreign key (signed_pdf_document_id) references documents(id) on delete set null;
alter table audit_substitution_assurances
  add constraint fk_asa_pdf foreign key (signed_pdf_document_id) references documents(id) on delete set null;
alter table customer_disclosure_assurances
  add constraint fk_cda_pdf foreign key (signed_pdf_document_id) references documents(id) on delete set null;
alter table verification_activities
  add constraint fk_va_report foreign key (report_document_id) references documents(id) on delete set null;
alter table sampling_test_results
  add constraint fk_str_coa foreign key (coa_document_id) references documents(id) on delete set null;
alter table hazard_analyses
  add constraint fk_ha_relied_doc foreign key (relied_on_document_id) references documents(id) on delete set null;

-- Sign+date ledger (Â§ 1.510). Append-only.
create table record_signatures (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  record_type                     text not null,
  record_id                       uuid not null,
  record_version                  int,
  action                          text not null check (action in
                                    ('created','modified','signed','superseded','reviewed')),
  modification_summary            text,
  signed_state_sha256             text not null,
  signed_by_user_id               uuid references importer_users(id),
  signed_by_qi_id                 uuid references qualified_individuals(id),
  signed_at                       timestamptz not null default now(),
  ip_address                      inet,
  user_agent                      text
);
create index ix_signatures_record on record_signatures (record_type, record_id, signed_at desc);

-- Document read/download log
create table document_access_log (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  document_id                     uuid not null references documents(id) on delete cascade,
  accessed_by_user_id             uuid references importer_users(id),
  accessed_by_kind                text not null check (accessed_by_kind in
                                    ('importer_user','supplier_portal','broker_api','admin','system')),
  action                          text not null check (action in ('view','download','export_bundle')),
  ip_address                      inet,
  user_agent                      text,
  accessed_at                     timestamptz not null default now()
);
create index ix_doc_access_doc on document_access_log (document_id, accessed_at desc);



-- ============================================================
-- 009_reminders_notifications.sql
-- ============================================================

-- 009_reminders_notifications.sql â€” reminder rows, notification delivery log, FDA request bundles

create table reminders (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  reminder_type                   text not null check (reminder_type in (
                                    'vsi_annual_attestation','supplier_assurance_renewal',
                                    'audit_substitution_assurance_renewal','customer_assurance_renewal',
                                    'fsvp_reassessment','supplier_evaluation_due',
                                    'hazard_analysis_reassessment','verification_activity_due',
                                    'qi_credential_expiring','temporary_approval_expiring',
                                    'follow_up_audit_due','inspection_response_due','custom')),
  target_entity_type              text,
  target_entity_id                uuid,
  due_at                          timestamptz not null,
  first_notify_at                 timestamptz,
  last_notified_at                timestamptz,
  snooze_until                    timestamptz,
  dismissed_at                    timestamptz,
  completed_at                    timestamptz,
  status                          text not null default 'pending' check (status in
                                    ('pending','notified','snoozed','dismissed','completed','expired')),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index ix_reminders_due
  on reminders (importer_id, due_at)
  where status in ('pending','notified','snoozed');

create table notification_deliveries (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid references importers(id) on delete set null,
  reminder_id                     uuid references reminders(id) on delete set null,
  channel                         text not null default 'email' check (channel in ('email','sms','in_app')),
  template_key                    text not null,
  to_address                      text not null,
  subject                         text,
  provider_message_id             text,
  target_entity_type              text,
  target_entity_id                uuid,
  sent_at                         timestamptz,
  delivered_at                    timestamptz,
  opened_at                       timestamptz,
  bounced_at                      timestamptz,
  bounce_reason                   text,
  failed_at                       timestamptz,
  failure_reason                  text,
  created_at                      timestamptz not null default now()
);
create index ix_notif_target on notification_deliveries (target_entity_type, target_entity_id);
create index ix_notif_message_id on notification_deliveries (provider_message_id) where provider_message_id is not null;

create table fda_request_bundles (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  inspection_id                   uuid references fda_inspections(id),
  requested_by_user_id            uuid not null references importer_users(id),
  scope_filters_json              jsonb not null,
  inspector_name                  text,
  inspector_request_text          text,
  bundle_document_id              uuid references documents(id),
  generated_at                    timestamptz,
  status                          text not null default 'generating' check (status in
                                    ('generating','ready','expired','failed')),
  created_at                      timestamptz not null default now()
);



-- ============================================================
-- 010_supplier_portal_api_ops.sql
-- ============================================================

-- 010_supplier_portal_api_ops.sql â€” supplier portal tokens/uploads, broker API credentials,
-- scheduled job dedupe, subscription entitlements

create table supplier_portal_tokens (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete cascade,
  token                           text not null unique,
  token_hash                      text not null,
  scopes                          text[] not null,
  target_entity_type              text,
  target_entity_id                uuid,
  expires_at                      timestamptz not null,
  consumed_at                     timestamptz,
  revoked_at                      timestamptz,
  last_used_at                    timestamptz,
  last_used_ip                    inet,
  created_at                      timestamptz not null default now()
);
create index ix_supplier_tokens_active
  on supplier_portal_tokens (supplier_id)
  where consumed_at is null and revoked_at is null;

create table supplier_portal_uploads (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete cascade,
  token_id                        uuid references supplier_portal_tokens(id) on delete set null,
  document_id                     uuid references documents(id) on delete set null,
  uploaded_at                     timestamptz not null default now(),
  uploader_ip                     inet,
  uploader_user_agent             text
);

create table api_credentials (
  id                              uuid primary key default gen_random_uuid(),
  broker_org_name                 text not null,
  importer_id                     uuid not null references importers(id) on delete cascade,
  key_prefix                      text not null,
  key_hash                        text not null,
  scopes                          text[] not null,
  last_used_at                    timestamptz,
  last_used_ip                    inet,
  revoked_at                      timestamptz,
  created_at                      timestamptz not null default now()
);
create unique index ux_api_key_prefix on api_credentials (key_prefix);

create table scheduled_job_runs (
  id                              uuid primary key default gen_random_uuid(),
  job_key                         text not null,
  run_idempotency_key             text not null,
  started_at                      timestamptz not null default now(),
  finished_at                     timestamptz,
  status                          text not null default 'running' check (status in
                                    ('running','succeeded','failed','partial')),
  rows_processed                  int,
  error_text                      text,
  unique (job_key, run_idempotency_key)
);

create table subscription_entitlements (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  plan_key                        text not null,
  stripe_subscription_id          text,
  max_suppliers                   int,
  max_foods                       int,
  max_users                       int,
  features                        text[] not null default '{}',
  period_start                    timestamptz,
  period_end                      timestamptz,
  status                          text not null default 'active' check (status in
                                    ('active','past_due','cancelled','trialing')),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index ix_entitlements_importer on subscription_entitlements (importer_id, status);



-- ============================================================
-- 011_reference_library_templates.sql
-- ============================================================

-- 011_reference_library_templates.sql â€” versioned hazard library, document templates,
-- and remaining FK backfills

create table hazard_library_versions (
  id                              uuid primary key default gen_random_uuid(),
  version_tag                     text not null unique,
  effective_from                  date not null,
  notes                           text,
  created_at                      timestamptz not null default now()
);

create table hazard_library (
  id                              uuid primary key default gen_random_uuid(),
  version_id                      uuid not null references hazard_library_versions(id) on delete cascade,
  commodity_category              text not null,
  commodity_subcategory           text,
  hazard_type                     text not null check (hazard_type in
                                    ('biological','chemical','radiological','physical')),
  hazard_name                     text not null,
  typical_severity                text,
  typical_probability             text,
  typical_sahcodha                boolean not null default false,
  recommended_controls            text,
  fda_citation                    text,
  created_at                      timestamptz not null default now()
);
create index ix_hazard_lib_lookup on hazard_library (version_id, commodity_category, hazard_type);

alter table hazard_analysis_hazards
  add constraint fk_hazard_library_version
  foreign key (hazard_library_version_id) references hazard_library(id) on delete set null;

create table document_templates (
  id                              uuid primary key default gen_random_uuid(),
  template_key                    text not null,
  version                         text not null,
  body_markdown                   text not null,
  meets_cfr_section               text,
  active                          boolean not null default true,
  created_at                      timestamptz not null default now(),
  unique (template_key, version)
);

alter table supplier_written_assurances
  add constraint fk_swa_template foreign key (template_id) references document_templates(id) on delete set null;



-- ============================================================
-- 012_triggers_rls_seed.sql
-- ============================================================

-- 012_triggers_rls_seed.sql â€” updated_at triggers, RLS enables, role_permissions seed

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'importers','importer_users','qualified_individuals','foreign_suppliers','foods',
    'hazard_analyses','supplier_evaluations',
    'supplier_written_assurances','audit_substitution_assurances','customer_disclosure_assurances',
    'verification_activities','audit_details','corrective_actions','fsvp_reassessments',
    'recall_events','fda_inspections','documents','reminders','subscription_entitlements'
  ] loop
    execute format(
      'create trigger trg_%I_updated_at before update on %I
         for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- RLS enables (policies finalized before launch)
alter table importers                       enable row level security;
alter table importer_users                  enable row level security;
alter table importer_entry_identities       enable row level security;
alter table qualified_individuals           enable row level security;
alter table qi_credentials                  enable row level security;
alter table eligibility_attestations        enable row level security;
alter table foreign_suppliers               enable row level security;
alter table foods                           enable row level security;
alter table food_supply_chain_links         enable row level security;
alter table hazard_analyses                 enable row level security;
alter table hazard_analysis_hazards         enable row level security;
alter table supplier_evaluations            enable row level security;
alter table supplier_written_assurances     enable row level security;
alter table audit_substitution_assurances   enable row level security;
alter table customer_disclosure_assurances  enable row level security;
alter table verification_activities         enable row level security;
alter table audit_details                   enable row level security;
alter table sampling_test_results           enable row level security;
alter table verification_nonconformities    enable row level security;
alter table corrective_actions              enable row level security;
alter table fsvp_reassessments              enable row level security;
alter table fsvp_reassessment_outcomes      enable row level security;
alter table recall_events                   enable row level security;
alter table fda_inspections                 enable row level security;
alter table fda_inspection_observations     enable row level security;
alter table import_entries                  enable row level security;
alter table documents                       enable row level security;
alter table record_signatures               enable row level security;
alter table document_access_log             enable row level security;
alter table reminders                       enable row level security;
alter table notification_deliveries         enable row level security;
alter table fda_request_bundles             enable row level security;
alter table supplier_portal_tokens          enable row level security;
alter table supplier_portal_uploads         enable row level security;
alter table api_credentials                 enable row level security;
alter table subscription_entitlements       enable row level security;

-- Policy template â€” repeat per tenant-scoped table, parameterized by role for writes:
--   create policy <table>_tenant_read on <table>
--     for select to authenticated
--     using (importer_id in (
--       select importer_id from importer_users
--         where clerk_user_id = auth.jwt()->>'sub' and removed_at is null));

-- Seed: role â†’ permission map
insert into role_permissions (role, permission) values
  ('owner','*'),
  ('admin','manage_users'),
  ('admin','manage_suppliers'),
  ('admin','manage_foods'),
  ('admin','manage_billing'),
  ('admin','sign_corrective_action'),
  ('qi','perform_hazard_analysis'),
  ('qi','perform_supplier_evaluation'),
  ('qi','perform_verification'),
  ('qi','perform_reassessment'),
  ('qi','sign_corrective_action'),
  ('contributor','draft_records'),
  ('contributor','upload_documents'),
  ('viewer','read');



-- ============================================================
-- 013_app_auth_storage_readiness.sql
-- ============================================================

-- 013_app_auth_storage_readiness.sql - Supabase Auth bridge and app-facing tables

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('supplier', 'reviewer', 'administrator');
  end if;
  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type user_status as enum ('active', 'pending', 'suspended');
  end if;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  importer_id uuid references importers(id) on delete set null,
  supplier_id uuid references foreign_suppliers(id) on delete set null,
  full_name text,
  email text not null,
  organization_name text,
  position text,
  phone_number text,
  country text,
  preferred_language text not null default 'en',
  supplier_type text,
  importer_type text,
  role app_role not null default 'supplier',
  user_status user_status not null default 'pending',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table importer_users add column if not exists supabase_user_id uuid references auth.users(id) on delete set null;
create index if not exists ix_importer_users_supabase_user on importer_users (supabase_user_id) where removed_at is null;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'administrator'
      and user_status = 'active'
  );
$$;

create or replace function public.current_importer_ids()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select importer_id from profiles where id = auth.uid() and importer_id is not null
  union
  select importer_id from importer_users where supabase_user_id = auth.uid() and removed_at is null;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, user_status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'supplier'),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_platform_admin() then
    return new;
  end if;

  new.role := old.role;
  new.user_status := old.user_status;
  new.importer_id := old.importer_id;
  new.supplier_id := old.supplier_id;
  return new;
end;
$$;

drop trigger if exists trg_profiles_prevent_role_escalation on profiles;
create trigger trg_profiles_prevent_role_escalation
  before update on profiles
  for each row execute function public.prevent_profile_role_escalation();

create table if not exists supplier_facilities (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid not null references foreign_suppliers(id) on delete cascade,
  facility_name text not null,
  facility_address_json jsonb not null default '{}'::jsonb,
  facility_type text not null,
  fda_registration_number text,
  production_capacity text,
  manufacturing_processes text,
  food_safety_certifications text[],
  certification_status text not null default 'pending_review'
    check (certification_status in ('active', 'pending_review', 'approved', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists supplier_products (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid not null references foreign_suppliers(id) on delete cascade,
  food_id uuid references foods(id) on delete set null,
  product_name text not null,
  product_category text,
  product_description text,
  ingredient_list text,
  country_of_origin text,
  intended_us_market text,
  product_specifications text,
  shelf_life text,
  packaging_information text,
  allergen_information text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version_number int not null,
  storage_path text not null,
  original_filename text,
  uploaded_by_profile_id uuid references profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  review_status text not null default 'submitted'
    check (review_status in ('draft', 'submitted', 'under_review', 'revision_required', 'approved', 'rejected')),
  review_notes text,
  unique (document_id, version_number)
);

create table if not exists document_reviews (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  reviewer_profile_id uuid references profiles(id) on delete set null,
  status text not null check (status in ('under_review', 'revision_required', 'approved', 'rejected')),
  notes text,
  reviewed_at timestamptz not null default now()
);

create table if not exists reviewer_assignments (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid not null references foreign_suppliers(id) on delete cascade,
  reviewer_profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  assigned_at timestamptz not null default now(),
  unique (supplier_id, reviewer_profile_id)
);

create table if not exists readiness_assessments (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid not null references foreign_suppliers(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'under_review', 'revision_required', 'approved')),
  overall_score numeric(5,2) not null default 0,
  gap_summary text,
  recommended_actions text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists readiness_scores (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  assessment_id uuid not null references readiness_assessments(id) on delete cascade,
  category text not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  evidence_summary text,
  gap_summary text,
  recommended_action text,
  created_at timestamptz not null default now(),
  unique (assessment_id, category)
);

create table if not exists review_comments (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid references foreign_suppliers(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  assessment_id uuid references readiness_assessments(id) on delete cascade,
  author_profile_id uuid references profiles(id) on delete set null,
  body text not null,
  visibility text not null default 'supplier_and_reviewer'
    check (visibility in ('internal', 'supplier_and_reviewer')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists app_notifications (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  recipient_profile_id uuid references profiles(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  target_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists generated_reports (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid references foreign_suppliers(id) on delete set null,
  report_type text not null check (report_type in ('supplier_readiness', 'compliance_gap', 'document_status', 'audit', 'executive_summary')),
  export_format text not null check (export_format in ('pdf', 'excel')),
  title text not null,
  storage_path text,
  generated_by_profile_id uuid references profiles(id) on delete set null,
  generated_at timestamptz not null default now()
);

create table if not exists background_reference_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  storage_path text not null,
  maintained_by_profile_id uuid references profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete set null,
  actor_profile_id uuid references profiles(id) on delete set null,
  action text not null,
  record_type text,
  record_id uuid,
  previous_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('supplier-documents', 'supplier-documents', false, 52428800, null),
  ('background-documents', 'background-documents', false, 52428800, null)
on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','supplier_facilities','supplier_products','document_versions','document_reviews',
    'reviewer_assignments','readiness_assessments','readiness_scores','review_comments',
    'app_notifications','generated_reports','background_reference_documents','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

drop policy if exists profiles_admin_insert on profiles;
create policy profiles_admin_insert on profiles
  for insert to authenticated
  with check (public.is_platform_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'importer_entry_identities','importer_users','qualified_individuals','qi_credentials',
    'eligibility_attestations','foreign_suppliers','foods','food_supply_chain_links','hazard_analyses',
    'supplier_evaluations','supplier_written_assurances',
    'audit_substitution_assurances','customer_disclosure_assurances','verification_activities',
    'audit_details','sampling_test_results','verification_nonconformities','corrective_actions',
    'fsvp_reassessments','recall_events','fda_inspections',
    'fda_inspection_observations','import_entries','documents','record_signatures',
    'document_access_log','reminders','notification_deliveries','fda_request_bundles',
    'supplier_portal_tokens','supplier_portal_uploads','api_credentials','subscription_entitlements',
    'supplier_facilities','supplier_products','document_versions','document_reviews',
    'reviewer_assignments','readiness_assessments','readiness_scores','review_comments',
    'app_notifications','generated_reports','audit_logs'
  ] loop
    execute format(
      'drop policy if exists %I_tenant_read on %I;
       create policy %I_tenant_read on %I for select to authenticated
       using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));',
      t, t, t, t
    );
    execute format(
      'drop policy if exists %I_tenant_write on %I;
       create policy %I_tenant_write on %I for all to authenticated
       using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
       with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));',
      t, t, t, t
    );
  end loop;
end $$;

drop policy if exists importers_tenant_read on importers;
create policy importers_tenant_read on importers
  for select to authenticated
  using (public.is_platform_admin() or id in (select public.current_importer_ids()));

drop policy if exists importers_tenant_write on importers;
create policy importers_tenant_write on importers
  for all to authenticated
  using (public.is_platform_admin() or id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or id in (select public.current_importer_ids()));

drop policy if exists hazard_analysis_hazards_tenant_read on hazard_analysis_hazards;
create policy hazard_analysis_hazards_tenant_read on hazard_analysis_hazards
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from hazard_analyses ha
      where ha.id = hazard_analysis_id
        and ha.importer_id in (select public.current_importer_ids())
    )
  );

drop policy if exists hazard_analysis_hazards_tenant_write on hazard_analysis_hazards;
create policy hazard_analysis_hazards_tenant_write on hazard_analysis_hazards
  for all to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from hazard_analyses ha
      where ha.id = hazard_analysis_id
        and ha.importer_id in (select public.current_importer_ids())
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from hazard_analyses ha
      where ha.id = hazard_analysis_id
        and ha.importer_id in (select public.current_importer_ids())
    )
  );

drop policy if exists fsvp_reassessment_outcomes_tenant_read on fsvp_reassessment_outcomes;
create policy fsvp_reassessment_outcomes_tenant_read on fsvp_reassessment_outcomes
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_reassessments fr
      where fr.id = reassessment_id
        and fr.importer_id in (select public.current_importer_ids())
    )
  );

drop policy if exists fsvp_reassessment_outcomes_tenant_write on fsvp_reassessment_outcomes;
create policy fsvp_reassessment_outcomes_tenant_write on fsvp_reassessment_outcomes
  for all to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_reassessments fr
      where fr.id = reassessment_id
        and fr.importer_id in (select public.current_importer_ids())
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_reassessments fr
      where fr.id = reassessment_id
        and fr.importer_id in (select public.current_importer_ids())
    )
  );

drop policy if exists background_reference_admin_read on background_reference_documents;
create policy background_reference_admin_read on background_reference_documents
  for select to authenticated
  using (true);

drop policy if exists background_reference_admin_write on background_reference_documents;
create policy background_reference_admin_write on background_reference_documents
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists supplier_documents_read on storage.objects;
create policy supplier_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'supplier-documents'
    and (public.is_platform_admin() or split_part(name, '/', 1)::uuid in (select public.current_importer_ids()))
  );

drop policy if exists supplier_documents_write on storage.objects;
create policy supplier_documents_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'supplier-documents'
    and (public.is_platform_admin() or split_part(name, '/', 1)::uuid in (select public.current_importer_ids()))
  );

drop policy if exists background_documents_read on storage.objects;
create policy background_documents_read on storage.objects
  for select to authenticated
  using (bucket_id = 'background-documents');

drop policy if exists background_documents_admin_write on storage.objects;
create policy background_documents_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'background-documents' and public.is_platform_admin())
  with check (bucket_id = 'background-documents' and public.is_platform_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','supplier_facilities','supplier_products','readiness_assessments',
    'background_reference_documents'
  ] loop
    execute format(
      'drop trigger if exists trg_%I_updated_at on %I;
       create trigger trg_%I_updated_at before update on %I
       for each row execute function set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;



-- ============================================================
-- 014_thrushcross_verify_redesign.sql
-- ============================================================

-- 014_thrushcross_verify_redesign.sql - ThrushCross Verify risk-first FSVP platform model

do $$
begin
  if not exists (select 1 from pg_type where typname = 'verify_role') then
    create type verify_role as enum ('foreign_supplier', 'us_importer', 'reviewer', 'administrator');
  end if;
  if not exists (select 1 from pg_type where typname = 'evidence_status') then
    create type evidence_status as enum (
      'not_started', 'missing', 'uploaded', 'under_review', 'accepted',
      'rejected', 'revision_required', 'complete'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'readiness_status') then
    create type readiness_status as enum (
      'not_ready', 'needs_major_revision', 'needs_minor_revision',
      'ready_for_importer_review', 'approved_for_internal_use'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'risk_level') then
    create type risk_level as enum ('low', 'medium', 'high', 'critical');
  end if;
end $$;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  organization_type text not null check (organization_type in ('foreign_supplier', 'us_importer', 'consultant', 'administrator')),
  country text,
  website text,
  status text not null default 'active' check (status in ('active', 'pending_review', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  importer_id uuid references importers(id) on delete cascade,
  role verify_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (profile_id, organization_id, role)
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  importer_id uuid references importers(id) on delete cascade,
  foreign_supplier_id uuid references foreign_suppliers(id) on delete set null,
  company_name text not null,
  legal_entity_name text,
  registration_number text,
  country text not null,
  address_json jsonb not null default '{}'::jsonb,
  website text,
  contact_json jsonb not null default '{}'::jsonb,
  export_markets text[],
  product_categories text[],
  fda_registration_number text,
  certification_status text not null default 'pending_review'
    check (certification_status in ('active', 'pending_review', 'approved', 'rejected', 'suspended')),
  approval_status text not null default 'pending_review'
    check (approval_status in ('active', 'pending_review', 'approved', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commodities (
  id uuid primary key default gen_random_uuid(),
  commodity_name text not null unique,
  commodity_group text,
  human_food boolean not null default true,
  animal_feed boolean not null default false,
  default_risk_level risk_level not null default 'medium',
  likely_biological_hazards text[],
  likely_chemical_hazards text[],
  likely_physical_hazards text[],
  allergen_risk text,
  recommended_evidence text[],
  created_at timestamptz not null default now()
);

create table if not exists products_verify (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  commodity_id uuid references commodities(id) on delete set null,
  product_name text not null,
  product_description text,
  country_of_origin text,
  raw_or_processed text check (raw_or_processed in ('raw', 'processed', 'both')),
  intended_use text check (intended_use in ('ready_to_eat', 'further_processed', 'animal_feed', 'ingredient', 'other')),
  ingredient_list text,
  product_specifications text,
  shelf_life text,
  packaging_information text,
  allergen_information text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists facilities_verify (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  facility_name text not null,
  facility_address_json jsonb not null default '{}'::jsonb,
  facility_type text not null,
  fda_registration_number text,
  production_capacity text,
  manufacturing_processes text,
  food_safety_certifications text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commodity_risks (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  product_id uuid references products_verify(id) on delete cascade,
  commodity_id uuid references commodities(id) on delete set null,
  country_of_origin text,
  raw_or_processed text,
  human_food_or_animal_feed text check (human_food_or_animal_feed in ('human_food', 'animal_feed', 'both')),
  ready_to_eat_or_further_processed text,
  biological_hazards text[],
  chemical_hazards text[],
  physical_hazards text[],
  allergen_risk text,
  supplier_certification_status text,
  recall_history_summary text,
  risk_level risk_level not null,
  risk_rationale text not null,
  required_verification_evidence text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fsvp_requirements (
  id uuid primary key default gen_random_uuid(),
  requirement_key text not null unique,
  requirement_name text not null,
  requirement_description text not null,
  cfr_citation text,
  required_evidence text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists requirement_evidence (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  product_id uuid references products_verify(id) on delete cascade,
  facility_id uuid references facilities_verify(id) on delete set null,
  requirement_id uuid not null references fsvp_requirements(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  document_version_id uuid references document_versions(id) on delete set null,
  reviewer_profile_id uuid references profiles(id) on delete set null,
  status evidence_status not null default 'not_started',
  reviewer_notes text,
  gap_status text,
  corrective_action_id uuid references corrective_actions(id) on delete set null,
  final_determination text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  product_id uuid references products_verify(id) on delete set null,
  reviewer_profile_id uuid references profiles(id) on delete set null,
  review_type text not null check (review_type in ('document', 'requirement', 'supplier', 'readiness_report')),
  status evidence_status not null default 'under_review',
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists readiness_reports (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  product_id uuid references products_verify(id) on delete set null,
  facility_id uuid references facilities_verify(id) on delete set null,
  commodity_risk_id uuid references commodity_risks(id) on delete set null,
  overall_score numeric(5,2) not null,
  readiness_status readiness_status not null,
  supplier_profile_summary text,
  product_profile_summary text,
  facility_profile_summary text,
  commodity_risk_summary text,
  hazard_analysis_summary text,
  documents_reviewed_json jsonb not null default '[]'::jsonb,
  requirement_mapping_json jsonb not null default '[]'::jsonb,
  reviewer_comments text,
  open_gaps text,
  corrective_actions_summary text,
  disclaimer text not null default 'This platform does not provide legal or regulatory advice. FSVP determinations should be reviewed by qualified regulatory professionals and/or a qualified FSVP Individual.',
  export_pdf_document_id uuid references documents(id) on delete set null,
  export_excel_document_id uuid references documents(id) on delete set null,
  approved_by_profile_id uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table readiness_scores add column if not exists weight_points numeric(5,2);
alter table readiness_scores add column if not exists critical_gap text;
alter table readiness_scores add column if not exists recommended_next_action text;
alter table documents add column if not exists related_requirement_id uuid references fsvp_requirements(id) on delete set null;
alter table documents add column if not exists expiration_date date;
alter table documents add column if not exists approval_status evidence_status default 'uploaded';
alter table documents add column if not exists reviewer_profile_id uuid references profiles(id) on delete set null;
alter table documents add column if not exists review_notes text;

insert into commodities (
  commodity_name, commodity_group, default_risk_level, likely_biological_hazards,
  likely_chemical_hazards, likely_physical_hazards, allergen_risk, recommended_evidence
) values
  ('Coffee', 'Beverage commodity', 'medium', array['Mold contamination'], array['Ochratoxin A','Pesticide residues'], array['Foreign material'], 'Low', array['COA','Supplier questionnaire','Traceability record']),
  ('Cocoa', 'Ingredient', 'high', array['Salmonella'], array['Heavy metals','Pesticide residues'], array['Foreign material'], 'Low', array['Hazard analysis','COA','Supplier audit']),
  ('Spices', 'Ingredient', 'high', array['Salmonella'], array['Adulterants','Pesticide residues'], array['Foreign material'], 'Variable', array['Kill-step validation','COA','Supplier audit']),
  ('Peanuts', 'Nut commodity', 'critical', array['Salmonella'], array['Aflatoxin'], array['Foreign material'], 'High', array['Aflatoxin testing','Allergen program','Recall history']),
  ('Tree nuts', 'Nut commodity', 'high', array['Salmonella'], array['Aflatoxin'], array['Shell fragments'], 'High', array['Allergen control program','COA','Traceability records']),
  ('Grains', 'Bulk commodity', 'medium', array['Mold contamination'], array['Mycotoxins','Pesticide residues'], array['Foreign material'], 'Variable', array['Mycotoxin testing','Storage controls','COA']),
  ('Oils', 'Processed commodity', 'medium', array[]::text[], array['Chemical contaminants','Adulteration'], array['Foreign material'], 'Variable', array['Product specification','COA','Process controls']),
  ('Fresh produce', 'Produce', 'high', array['Pathogens'], array['Pesticide residues'], array['Foreign material'], 'Low', array['Audit report','Water testing','Recall procedure']),
  ('Dried fruit', 'Produce ingredient', 'high', array['Mold contamination'], array['Sulfites','Mycotoxins'], array['Foreign material'], 'Sulfite risk', array['COA','Sulfite declaration','Mock recall report']),
  ('Seafood', 'Animal protein', 'critical', array['Pathogens'], array['Histamine'], array['Foreign material'], 'Fish/shellfish allergen', array['HACCP plan','Temperature records','Traceability records'])
on conflict (commodity_name) do nothing;

insert into fsvp_requirements (requirement_key, requirement_name, requirement_description, cfr_citation, required_evidence, sort_order)
values
  ('supplier_identity', 'Supplier identity and contact', 'Document foreign supplier identity, contact information, registration, and relationship to importer.', '21 CFR 1.502-1.509', 'Supplier questionnaire, registration details, ownership/contact attestation', 10),
  ('product_identity', 'Product and commodity identity', 'Document the food, commodity, intended use, origin, specifications, allergens, and processing state.', '21 CFR 1.504', 'Product specification, ingredient/allergen statement, intended use record', 20),
  ('facility_information', 'Facility information', 'Document facility location, processes, FDA registration, capacity, and safety certifications.', '21 CFR 1.504-1.506', 'Facility profile, FDA registration, process flow, certifications', 30),
  ('hazard_analysis', 'Commodity hazard analysis', 'Identify known or reasonably foreseeable biological, chemical, and physical hazards.', '21 CFR 1.504', 'Hazard analysis and qualified individual review', 40),
  ('verification_activities', 'Verification activities', 'Determine appropriate supplier verification activities based on hazard and supplier risk.', '21 CFR 1.506', 'Audit, sampling/testing, COA, records review, verification rationale', 50),
  ('food_safety_controls', 'Food safety controls', 'Document preventive controls, process controls, CCPs, corrective actions, and monitoring evidence.', '21 CFR 1.506', 'Food safety plan, HACCP/HARPC plan, monitoring records', 60),
  ('testing_coa', 'Testing and COAs', 'Maintain testing evidence and certificates of analysis appropriate to the commodity risk.', '21 CFR 1.506', 'COA, lab testing report, sampling plan', 70),
  ('traceability_recall', 'Traceability and recall', 'Document lot traceability, recall procedures, and mock recall performance.', '21 CFR 1.508-1.510', 'Traceability records, recall procedure, mock recall report', 80),
  ('corrective_actions', 'Corrective actions', 'Document corrective actions taken when verification evidence or supplier performance is inadequate.', '21 CFR 1.508', 'Corrective action record and closure evidence', 90)
on conflict (requirement_key) do nothing;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','user_roles','suppliers','commodities','products_verify','facilities_verify',
    'commodity_risks','fsvp_requirements','requirement_evidence','reviews','readiness_reports'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

drop policy if exists organizations_user_read on organizations;
create policy organizations_user_read on organizations
  for select to authenticated
  using (
    public.is_platform_admin()
    or id in (select organization_id from user_roles where profile_id = auth.uid() and active)
  );

drop policy if exists organizations_admin_write on organizations;
create policy organizations_admin_write on organizations
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists user_roles_self_read on user_roles;
create policy user_roles_self_read on user_roles
  for select to authenticated
  using (public.is_platform_admin() or profile_id = auth.uid());

drop policy if exists user_roles_admin_write on user_roles;
create policy user_roles_admin_write on user_roles
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists fsvp_requirements_read on fsvp_requirements;
create policy fsvp_requirements_read on fsvp_requirements
  for select to authenticated
  using (active);

drop policy if exists fsvp_requirements_admin_write on fsvp_requirements;
create policy fsvp_requirements_admin_write on fsvp_requirements
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists commodities_read on commodities;
create policy commodities_read on commodities
  for select to authenticated
  using (true);

drop policy if exists commodities_admin_write on commodities;
create policy commodities_admin_write on commodities
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'suppliers','products_verify','facilities_verify','commodity_risks',
    'requirement_evidence','reviews','readiness_reports'
  ] loop
    execute format(
      'drop policy if exists %I_tenant_read on %I;
       create policy %I_tenant_read on %I for select to authenticated
       using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));',
      t, t, t, t
    );
    execute format(
      'drop policy if exists %I_tenant_write on %I;
       create policy %I_tenant_write on %I for all to authenticated
       using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
       with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));',
      t, t, t, t
    );
  end loop;
end $$;

drop policy if exists suppliers_org_write on suppliers;
create policy suppliers_org_write on suppliers
  for all to authenticated
  using (
    public.is_platform_admin()
    or organization_id in (
      select organization_id from user_roles
      where profile_id = auth.uid()
        and role = 'foreign_supplier'
        and active
    )
  )
  with check (
    public.is_platform_admin()
    or organization_id in (
      select organization_id from user_roles
      where profile_id = auth.uid()
        and role = 'foreign_supplier'
        and active
    )
  );

drop policy if exists products_supplier_org_write on products_verify;
create policy products_supplier_org_write on products_verify
  for all to authenticated
  using (
    public.is_platform_admin()
    or supplier_id in (
      select s.id from suppliers s
      join user_roles ur on ur.organization_id = s.organization_id
      where ur.profile_id = auth.uid()
        and ur.role = 'foreign_supplier'
        and ur.active
    )
  )
  with check (
    public.is_platform_admin()
    or supplier_id in (
      select s.id from suppliers s
      join user_roles ur on ur.organization_id = s.organization_id
      where ur.profile_id = auth.uid()
        and ur.role = 'foreign_supplier'
        and ur.active
    )
  );

drop policy if exists facilities_supplier_org_write on facilities_verify;
create policy facilities_supplier_org_write on facilities_verify
  for all to authenticated
  using (
    public.is_platform_admin()
    or supplier_id in (
      select s.id from suppliers s
      join user_roles ur on ur.organization_id = s.organization_id
      where ur.profile_id = auth.uid()
        and ur.role = 'foreign_supplier'
        and ur.active
    )
  )
  with check (
    public.is_platform_admin()
    or supplier_id in (
      select s.id from suppliers s
      join user_roles ur on ur.organization_id = s.organization_id
      where ur.profile_id = auth.uid()
        and ur.role = 'foreign_supplier'
        and ur.active
    )
  );

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','suppliers','products_verify','facilities_verify',
    'commodity_risks','requirement_evidence','readiness_reports'
  ] loop
    execute format(
      'drop trigger if exists trg_%I_updated_at on %I;
       create trigger trg_%I_updated_at before update on %I
       for each row execute function set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;


