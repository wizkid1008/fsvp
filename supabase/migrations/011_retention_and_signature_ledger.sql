-- ============================================================================
-- 011_retention_and_signature_ledger.sql — records that cannot quietly vanish,
-- and a ledger that shows they were signed.
--
-- Roadmap Phase 1 item 5, and the two halves are 21 CFR 1.510:
--
--   § 1.510(a)(2)  "You must sign and date records concerning your FSVP upon
--                  initial completion and upon any modification of the FSVP."
--   § 1.510(c)(1)  Retain records referenced in the subpart until at least
--                  2 years after you created or obtained them.
--   § 1.510(c)(2)  Records relating to processes and procedures — including the
--                  results of evaluations and determinations — for at least
--                  2 years after their USE IS DISCONTINUED.
--
-- The signature half was largely built already: qi_attestations snapshots the
-- text and its SHA-256, and the § 1.503 gate re-hashes the live narrative, so a
-- modified record fails until it is signed again. That IS the (a)(2) mechanism.
-- What was missing is the ability to SHOW it: the signatures were spread across
-- three target columns with no single place to read a record's history from.
-- Hence the ledger view at the bottom.
--
-- The retention half was missing entirely, and in one place was actively wrong:
-- components/evidence/DocumentActions.tsx hard-deletes requirement_evidence
-- rows when a document is removed, destroying the link recording WHICH
-- requirement the evidence satisfied. The soft delete kept the document and
-- threw away its meaning.
--
-- Retention here is enforced by refusing the DELETE, not by hiding the button.
-- A control that lives only in the UI is not a control: the same rows are
-- reachable from the API, from SQL, and from any future screen that forgets.
-- ============================================================================

begin;

-- ── The retention clock ────────────────────────────────────────────────────

-- § 1.510(c) sets two years as the floor in both paragraphs.
create or replace function public.fsvp_retention_years()
returns int
language sql
immutable
as $$ select 2 $$;

comment on function public.fsvp_retention_years is
  '21 CFR 1.510(c) retention floor in years. A function rather than a literal so '
  'the period is stated once and can be raised without hunting through triggers.';

-- Evidence carries its own retention date so the UI can show it and a person
-- can see when a document becomes disposable, rather than discovering it by
-- being refused.
alter table documents add column retention_until date;

comment on column documents.retention_until is
  '21 CFR 1.510(c)(1): earliest date this document may be deleted. Defaults to '
  'two years after it was obtained. Deletion is refused until then.';

update documents
   set retention_until = (coalesce(uploaded_at, created_at)::date
                          + (public.fsvp_retention_years() * interval '1 year'))::date
 where retention_until is null;

create or replace function public.set_document_retention()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.retention_until is null then
    new.retention_until := (coalesce(new.uploaded_at, new.created_at, now())::date
                            + (public.fsvp_retention_years() * interval '1 year'))::date;
  end if;
  return new;
end;
$$;

create trigger trg_document_retention
  before insert on documents
  for each row execute function public.set_document_retention();

-- ── Refusing the delete ────────────────────────────────────────────────────
--
-- One function for every retention-bound table, branching on TG_TABLE_NAME to
-- find the moment that starts the clock. Two shapes:
--
--   (c)(1) tables — the clock starts when the record was created or obtained.
--   (c)(2) tables — determinations and evaluations, whose clock does not start
--          until their USE IS DISCONTINUED. A determination still in force has
--          not started its two years at all, so it can never be deleted while
--          live. That is the correct reading and also the safer one.
--
-- The service role is NOT exempt. Every write path in this app uses the admin
-- client, so exempting it would exempt everything and leave the guard
-- decorative.

create or replace function public.enforce_fsvp_retention()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_clock_starts timestamptz;
  v_in_use       boolean := false;
  v_label        text;
begin
  case tg_table_name
    when 'documents' then
      v_label := 'This document';
      v_clock_starts := coalesce(old.uploaded_at, old.created_at);

    when 'qi_attestations' then
      -- A signature is the record that a determination was made. § 1.510(a)(2)
      -- is meaningless if the signature can be removed afterwards.
      v_label := 'This qualified individual signature';
      v_clock_starts := old.signed_at;

    when 'approval_decisions' then
      v_label := 'This approval decision';
      v_clock_starts := old.decided_at;

    when 'fsvp_records' then
      v_label := 'This FSVP record';
      v_clock_starts := old.created_at;

    -- ── § 1.510(c)(2): in force means the clock has not started ────────────
    when 'fsvp_applicability_determinations' then
      v_label := 'This applicability determination';

      -- A determination with no signature never became a record. § 1.503
      -- requires a qualified individual to make it and § 1.510(a)(2) requires
      -- it signed; until both have happened there is nothing to retain.
      --
      -- This is not a loophole, it is the rollback path: /api/applicability
      -- creates the determination and then signs it, and deletes the row if the
      -- signature fails, precisely so a determination without its signature
      -- never survives. Refusing that delete would leave exactly the artefact
      -- the route is trying to prevent.
      if not exists (
        select 1 from qi_attestations
        where applicability_determination_id = old.id
      ) then
        return old;
      end if;

      v_in_use := old.superseded_at is null;
      v_clock_starts := old.superseded_at;

    when 'verification_determinations' then
      v_label := 'This verification activities determination';
      v_in_use := old.superseded_at is null;
      v_clock_starts := old.superseded_at;

    when 'written_assurances' then
      v_label := 'This written assurance';
      v_in_use := old.superseded_at is null;
      v_clock_starts := old.superseded_at;

    when 'supplier_compliance_screenings' then
      v_label := 'This compliance screening';
      v_in_use := old.superseded_at is null;
      v_clock_starts := old.superseded_at;

    else
      -- An unlisted table reaching this trigger is a wiring mistake. Refusing
      -- is the safe direction: a record kept too long is a nuisance, a record
      -- destroyed inside its retention period is a regulatory failure.
      raise exception
        'Retention guard is attached to % but has no rule for it. Add one before deleting.',
        tg_table_name;
  end case;

  if v_in_use then
    raise exception
      '% is still in force, so its 21 CFR 1.510(c)(2) retention period has not started. '
      'Supersede it first; two years after that it may be deleted.', v_label;
  end if;

  if v_clock_starts is null then
    raise exception
      '% has no date to start its retention period from, so it cannot be shown to be '
      'outside 21 CFR 1.510(c). It cannot be deleted.', v_label;
  end if;

  if v_clock_starts > now() - (public.fsvp_retention_years() * interval '1 year') then
    raise exception
      '21 CFR 1.510(c): % must be retained until %. Records inside their retention period '
      'cannot be deleted — remove it from active evidence instead.',
      v_label,
      to_char((v_clock_starts + (public.fsvp_retention_years() * interval '1 year'))::date, 'YYYY-MM-DD');
  end if;

  return old;
end;
$$;

create trigger trg_retention_documents
  before delete on documents
  for each row execute function public.enforce_fsvp_retention();

create trigger trg_retention_qi_attestations
  before delete on qi_attestations
  for each row execute function public.enforce_fsvp_retention();

create trigger trg_retention_approval_decisions
  before delete on approval_decisions
  for each row execute function public.enforce_fsvp_retention();

create trigger trg_retention_fsvp_records
  before delete on fsvp_records
  for each row execute function public.enforce_fsvp_retention();

create trigger trg_retention_applicability
  before delete on fsvp_applicability_determinations
  for each row execute function public.enforce_fsvp_retention();

create trigger trg_retention_verification_determinations
  before delete on verification_determinations
  for each row execute function public.enforce_fsvp_retention();

create trigger trg_retention_assurances
  before delete on written_assurances
  for each row execute function public.enforce_fsvp_retention();

create trigger trg_retention_screenings
  before delete on supplier_compliance_screenings
  for each row execute function public.enforce_fsvp_retention();

-- ── Keep the link between evidence and what it satisfied ───────────────────
-- requirement_evidence records WHICH requirement a document answered. Deleting
-- it leaves a retained document whose meaning is gone, which satisfies the
-- letter of retention and none of its purpose. Soft-deleted instead, so the
-- link survives while dropping out of the working queries.

alter table requirement_evidence add column soft_deleted_at timestamptz;

comment on column requirement_evidence.soft_deleted_at is
  'Set when the evidence is withdrawn from active use. The row is retained: it is '
  'the record of which requirement a document was offered against.';

create index ix_requirement_evidence_live on requirement_evidence (document_id)
  where soft_deleted_at is null;

-- ── The signature ledger (§ 1.510(a)(2)) ───────────────────────────────────
--
-- qi_attestations already holds every signature; what was missing was one place
-- to read them from. The three target columns are resolved into a single
-- (record_type, record_id) pair so an inspection package, a record page and a
-- report can all ask the same question: who signed this, when, and is that
-- signature still current?
--
-- security_invoker so the querying user's RLS applies. Without it the view
-- would run as its owner and hand every tenant's signatures to anyone who
-- selected from it.

create view fsvp_signature_ledger
with (security_invoker = true)
as
select
  a.id,
  a.importer_id,
  a.attestation_type,
  -- qi_attestations carries exactly one of two targets (008). The § 1.506(d)
  -- determination added in 010 is deliberately NOT a third: it records its own
  -- qualified individual, and the record-level verification_determination
  -- attestation already covers the same decision. Signing it twice would be
  -- ceremony, not control.
  case
    when a.fsvp_record_id is not null then 'fsvp_record'
    else 'applicability_determination'
  end                                                        as target_type,
  coalesce(a.fsvp_record_id, a.applicability_determination_id) as target_id,
  a.qualified_individual_id,
  q.profile_id                                               as signer_profile_id,
  p.full_name                                                as signer_name,
  p.email                                                    as signer_email,
  a.statement,
  a.content_hash,
  a.signed_at,
  a.revoked_at,
  a.revoked_reason,
  (a.revoked_at is null)                                     as is_current
from qi_attestations a
join qualified_individuals q on q.id = a.qualified_individual_id
left join profiles p          on p.id = q.profile_id;

comment on view fsvp_signature_ledger is
  '21 CFR 1.510(a)(2) evidence: every FSVP signature with its signer, date and the '
  'hash of what was signed, across all three kinds of signed record.';

commit;
