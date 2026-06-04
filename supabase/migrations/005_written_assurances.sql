-- 005_written_assurances.sql — three regulatory-distinct assurance tables

-- §7a Supplier equivalence assurance (VSI § 1.512(b)(3) and small-supplier § 1.512(c))
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

-- §7b Audit-substitution assurance (§ 1.506(d)(2))
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

-- §7c Customer disclosure + assurance (§ 1.507)
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
