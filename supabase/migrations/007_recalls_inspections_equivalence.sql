-- 007_recalls_inspections_equivalence.sql — recalls, FDA inspections, country equivalence

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

-- Country equivalence (§ 1.513)
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
