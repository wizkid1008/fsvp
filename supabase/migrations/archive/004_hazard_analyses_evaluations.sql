-- 004_hazard_analyses_evaluations.sql — hazard analyses, hazards child, supplier evaluations

-- Hazard analyses (§ 1.504)
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

-- Supplier evaluations (§§ 1.505, 1.506)
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
