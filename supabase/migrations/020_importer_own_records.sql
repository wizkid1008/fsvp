-- ============================================================================
-- 020: The importer's own FSVP records
--
-- THE GAP
--
-- Every evidence surface in this platform points at the foreign supplier's
-- operation. requirement_sections.applies_to allows 'facility', 'product' and
-- 'supplier'; documents are uploaded against a supplier, a facility or a
-- product. So the platform models everything an importer must DECIDE and
-- nothing an importer must HOLD.
--
-- FSVP requires both. Most of the deciding is already covered — the hazard
-- analysis, supplier evaluation and verification determination live as
-- narratives on fsvp_records with QI signatures; verification activities,
-- written assurances, reassessments and corrective actions all have tables.
-- But several obligations fall on the importer as standing documents, and had
-- nowhere to live at all:
--
--   § 1.506(b)  Written procedures for ensuring food is imported only from
--               approved foreign suppliers. A standing procedure, not
--               per-record.
--   § 1.503     Qualified individual qualifications — education, training or
--               experience. The register records the BASIS as a field; the CV,
--               certificate or course record backing it had nowhere to go.
--   § 1.510     Records procedures: signed and dated, kept two years past
--               discontinuation, in English, produced promptly on request.
--   § 1.509     Importer identification at entry (DUNS / FSV code).
--
-- These are exactly the documents an FDA investigator asks for first, because
-- they establish that an FSVP exists at all before any individual record is
-- examined.
--
-- WHAT THIS MIGRATION DOES, AND WHAT IT DOES NOT NEED TO
--
-- Only one constraint actually blocks this: requirement_sections.applies_to.
-- documents.linked_entity_type is unconstrained text and documents.importer_id
-- already exists, so importer-level evidence needed no schema change — the
-- restriction lived entirely in the upload route's allowlist.
--
-- Safe to apply: one CHECK widened. No existing row can violate it.
-- ============================================================================

begin;

alter table requirement_sections
  drop constraint if exists requirement_sections_applies_to_check;

alter table requirement_sections
  add constraint requirement_sections_applies_to_check
  check (applies_to in ('importer', 'supplier', 'facility', 'product'));

comment on column requirement_sections.applies_to is
  'Which entity a section of requirements is about. "importer" covers the '
  'documents FSVP requires the importer itself to hold — § 1.506(b) written '
  'procedures, § 1.503 QI qualifications, § 1.510 records procedures — as '
  'distinct from evidence about a foreign supplier''s operation.';

-- Nothing needed on the scoring side: scoring_category_weights has no
-- applies_to of its own, it joins to requirement_sections. Weighting an
-- importer section therefore works the moment the section can exist.
--
-- rule_sets.applies_to is a separate, older enum ('facility', 'product',
-- 'fsvp_record', 'all') and is deliberately left alone — nothing reads it for
-- evidence scoping, and widening an unused constraint invites the assumption
-- that something does.

-- Documents pointing at an importer are found by linked_entity_type, and every
-- other entity type already has an index of this shape.
create index if not exists ix_documents_importer_linked
  on documents (linked_entity_id)
  where linked_entity_type = 'importer' and soft_deleted_at is null;

commit;
