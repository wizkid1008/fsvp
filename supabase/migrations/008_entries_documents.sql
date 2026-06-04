-- 008_entries_documents.sql — import entries, document vault (+ all FK backfills),
-- record signatures ledger, document access log

-- Import entries (§ 1.509 per-line attestation)
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

-- Sign+date ledger (§ 1.510). Append-only.
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
