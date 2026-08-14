-- Retire the legacy flat requirements model.
--
-- Two generations of the same idea have been live side by side:
--
--   fsvp_requirements + requirement_evidence      (flat, global, unversioned)
--   requirement_sections + requirement_items      (versioned, scoped by entity)
--
-- and `documents` carried a foreign key to BOTH. Nothing was broken, because
-- the upload route wrote both pointers on every upload — but the failure mode
-- when someone forgot was silent: evidence that counts toward one view and not
-- another. That is exactly what went wrong on /my-readiness, where a score
-- computed from requirement_items sat above a checklist read from
-- fsvp_requirements, disagreeing about the same supplier.
--
-- The scoring engine, /my-readiness, the dashboard, the review queue and the
-- corporate screens all read the versioned model. The legacy pair was read by
-- the document library and its edit dialog, and nothing else.
--
-- WHY THIS IS A DROP AND NOT A DATA MIGRATION
--
-- The two taxonomies do not correspond one-to-one — nine flat global keys
-- against twenty sections scoped by applies_to — so translating pointers would
-- have meant interpreting what each filed document was meant to prove, and
-- three legacy keys have no target at all under some entity types. A mapping
-- was designed and then thrown away, because a survey of the database on
-- 2026-08-14 found there was nothing to map:
--
--   requirement_evidence                     0 rows, ever
--   documents with related_requirement_id    0
--   documents with requirement_item_id       2
--
-- The legacy dropdown existed but no one ever used it. Re-filing evidence
-- under a guessed requirement would have been the risk here; there is no
-- evidence to re-file.
--
-- The guard below re-checks that at apply time rather than trusting the
-- snapshot, because this migration may reach an environment the survey did not
-- cover. If anything is found, it aborts without changing a thing.

do $$
declare
  v_evidence_rows  bigint := 0;
  v_pointer_rows   bigint := 0;
begin
  if to_regclass('public.requirement_evidence') is not null then
    execute 'select count(*) from requirement_evidence' into v_evidence_rows;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'documents'
      and column_name  = 'related_requirement_id'
  ) then
    execute 'select count(*) from documents where related_requirement_id is not null'
      into v_pointer_rows;
  end if;

  if v_evidence_rows > 0 or v_pointer_rows > 0 then
    raise exception using
      errcode = 'raise_exception',
      message = format(
        'Refusing to drop the legacy requirements model: %s requirement_evidence row(s) '
        'and %s document(s) still point at it.',
        v_evidence_rows, v_pointer_rows),
      hint = 'This database holds legacy evidence the 2026-08-14 survey did not find. '
             'Map documents.related_requirement_id onto documents.requirement_item_id '
             'before re-running, and check requirement_evidence for reviewer_notes, '
             'gap_status or final_determination — those three columns have no home on '
             'documents and would be lost.';
  end if;
end $$;

-- ── Drop, innermost dependency first ───────────────────────────────────────
-- requirement_evidence.requirement_id and documents.related_requirement_id are
-- the only foreign keys into fsvp_requirements (confirmed against
-- information_schema, not assumed).

alter table documents drop column if exists related_requirement_id;

-- Takes ix_requirement_evidence_live (migration 011) and the
-- requirement_evidence_tenant RLS policy (001) with it.
drop table if exists requirement_evidence;

-- Takes fsvp_requirements_read and fsvp_requirements_admin_write (001).
drop table if exists fsvp_requirements;

-- The seed in 002_reference_data.sql still inserts the nine legacy rows. That
-- migration is left untouched: it has already been applied everywhere, and a
-- fresh rebuild runs 002 before this file, so the rows are created and then
-- dropped in the same run. Editing an applied migration to avoid a few
-- transient inserts is the more dangerous trade.

comment on column documents.requirement_item_id is
  'The requirement this document answers. Sole requirement pointer since '
  'migration 023 retired documents.related_requirement_id; references '
  'requirement_items, which is versioned and scoped by applies_to.';
