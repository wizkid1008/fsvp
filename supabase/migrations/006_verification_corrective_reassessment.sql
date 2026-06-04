-- 006_verification_corrective_reassessment.sql — verification activities, child detail tables,
-- corrective actions, FSVP reassessments

-- Verification activities (§§ 1.506–1.508)
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

-- Corrective actions (§ 1.508)
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

-- FSVP reassessment (§ 1.502(c))
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
