-- ============================================================================
-- 028: some company-level evidence belongs to a RELATIONSHIP, not a company
--
-- THE BUG THIS CLOSES
--
-- Company-level evidence is matched on supplier_id alone — in
-- RequiredEvidenceChecklist and in lib/readiness/supplier-score.ts, which read
-- the same column on purpose so the list and the score cannot disagree. RLS
-- (004_reviewer_tenancy.sql) then lets any importer linked to an exporter read
-- every document filed against that exporter, whoever uploaded it.
--
-- For most of the supplier requirement set that is correct and valuable. An
-- exporter's recall plan, food safety policy, questionnaire and legal entity
-- documents are one document each; importer B should not have to re-collect
-- what importer A already gathered.
--
-- Two of the twelve items are not like that:
--
--   written_assurances       21 CFR 1.506(e)(2) — an undertaking given BY one
--                            supplier TO one importer.
--   importer_acknowledgement Confirmation that the supplier knows THIS importer
--                            is relying on its controls.
--
-- Both are agreements between two named parties. Importer A's signed assurance
-- says nothing about whether the exporter gave one to importer B. Yet on a
-- shared exporter, A's document satisfied B's checklist — and because
-- written_assurances is is_critical_blocker, it CLEARED B'S BLOCKER on the one
-- company-level item that carries a CFR citation. A compliance record asserting
-- an assurance that does not exist is the worst failure mode this table has.
--
-- WHY A COLUMN RATHER THAN A HARD-CODED LIST OF TWO ITEM KEYS
--
-- The distinction is regulatory, not cosmetic: it is about who the parties to
-- the document are. Encoding it on the requirement means the next
-- relationship-scoped requirement is a data change rather than another special
-- case in two query builders, and it lets an administrator see the property in
-- the rules UI rather than inferring it from application code.
--
-- WHY NOT SIMPLY FILTER EVERYTHING BY documents.importer_id
--
-- Because that column is deliberately null for exactly the case that matters.
-- app/api/documents/upload/route.ts, when an exporter uploads and serves more
-- than one importer: "there is no single right answer, so leave it null".
-- Filtering all company evidence by importer_id would hide the exporter's own
-- food safety policy from every importer — breaking the ten items that SHOULD
-- be shared in order to fix the two that should not.
--
-- Default 'entity' keeps every existing item behaving exactly as it does today.
-- ============================================================================

begin;

alter table requirement_items
  add column if not exists evidence_scope text not null default 'entity'
    check (evidence_scope in ('entity', 'importer_relationship'));

comment on column requirement_items.evidence_scope is
  'Who the evidence belongs to. ''entity'': a property of the company, facility '
  'or product itself — one document satisfies the requirement for every importer '
  'who reads it. ''importer_relationship'': an agreement between one supplier and '
  'one importer, satisfied only by a document filed for THAT importer. Consumers '
  'must match relationship-scoped items on documents.importer_id as well as the '
  'entity id; see lib/readiness/evidence-scope.ts, which is the single '
  'implementation both the checklist and the score call.';

-- Backfilled by item_key rather than by id, so every published, draft and
-- archived rule version is corrected at once. A version that predates these
-- keys simply matches nothing.
update requirement_items
   set evidence_scope = 'importer_relationship'
 where item_key in ('written_assurances', 'importer_acknowledgement');

commit;
