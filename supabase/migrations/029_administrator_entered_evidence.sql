-- ============================================================================
-- 029: evidence an administrator entered on an account's behalf
--
-- Administrators previewing an account were refused every evidence write
-- (lib/auth/preview-guard.ts), because the only sources the record could state
-- were the supplier, the importer acting for them, or a third party — and an
-- administrator is none of those. Filing the document under one of them would
-- misstate who stood behind it.
--
-- Rather than keep refusing, give the record a way to say it truthfully. A
-- document with evidence_source = 'administrator_entered' was filed by platform
-- staff; it enters the importer's review queue as 'submitted' like supplier
-- evidence, and the inspection package prints its source, so nobody mistakes
-- it for something the supplier attested to.
-- ============================================================================

begin;

alter table documents drop constraint if exists documents_evidence_source_check;

alter table documents
  add constraint documents_evidence_source_check
  check (evidence_source in ('supplier_attested', 'importer_uploaded', 'third_party', 'administrator_entered'));

commit;
