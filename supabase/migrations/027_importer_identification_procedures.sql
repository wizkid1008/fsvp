-- ============================================================================
-- 027: Two more obligations become written records rather than uploads
--
-- Migration 021 made the § 1.506(b) and § 1.510 procedures editable records,
-- on the reasoning that a document describing YOUR OWN process is safe to
-- draft and dangerous to leave as a stale PDF. The same reasoning reaches two
-- of the obligations 020 left as file uploads:
--
--   § 1.509  importer identification at entry — the platform already holds the
--            D-U-N-S it names, so a draft states a fact it is the system of
--            record for. What it cannot know is who transmits the identifier
--            and how currency is confirmed; those stay review passages.
--
--   § 1.504(a) reliance on another entity's hazard analysis — the one case
--            where the platform asserts almost nothing. It is a form: the
--            structure the section expects, with the substance left to the
--            qualified individual who did the review. Worth generating anyway,
--            because "review and assess it, and document that you did" is an
--            obligation people fail by not knowing what the document should
--            contain.
--
-- Both still take uploads alongside. A written record about the D-U-N-S is not
-- the Dun & Bradstreet record itself, and a review of someone else's hazard
-- analysis is not that analysis — the file remains the thing being assessed.
--
-- Safe to apply: widens one CHECK constraint. No existing row can violate the
-- wider set, and nothing outside importer_procedures is touched.
-- ============================================================================

begin;

alter table importer_procedures
  drop constraint if exists importer_procedures_kind_check;

alter table importer_procedures
  add constraint importer_procedures_kind_check check (kind in (
    'approved_supplier_procedures',
    'records_procedures',
    'importer_identification',
    'hazard_analysis_reliance'
  ));

comment on column importer_procedures.kind is
  'Matches a key in IMPORTER_RECORD_KINDS (lib/fsvp/importer-records.ts), so '
  'the obligation a procedure answers is the same identifier everywhere. '
  'qi_qualifications is deliberately absent: a qualified individual''s CV is '
  'external evidence about a person, not a description of the importer''s '
  'own process, so it stays an upload.';

commit;
