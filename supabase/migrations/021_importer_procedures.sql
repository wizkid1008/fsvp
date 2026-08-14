-- ============================================================================
-- 021: Importer procedures as editable, versioned records
--
-- Migration 020 gave the importer somewhere to FILE its own documents. That is
-- right for the ones that are genuinely external — a qualified individual's CV,
-- evidence of a D-U-N-S. It is wrong for the two that describe the importer's
-- own process.
--
-- A § 1.506(b) procedure kept as an uploaded PDF goes stale the moment the
-- process changes and nobody remembers to re-upload it. Worse, FSVP requires
-- you to FOLLOW your written procedure, so a stale document is not merely
-- unhelpful — it makes you non-compliant with your own stated process.
--
-- Kept as a record instead, it can be drafted from what the platform already
-- enforces, edited in place, adopted with a signature, and versioned. § 1.510
-- requires records signed and dated; adoption captures both without asking
-- anyone to remember.
--
-- WHY VERSIONS RATHER THAN AN UPDATE IN PLACE
--
-- § 1.510 retention applies to the procedure as much as to any other FSVP
-- record: an investigator may ask which procedure was in force when a
-- particular approval was made. Overwriting would destroy that answer. So
-- adopting a new version supersedes the previous one and never deletes it, and
-- the retention trigger from migration 011 is not needed here because nothing
-- offers a delete at all.
--
-- Safe to apply: one new table, no changes to existing ones.
-- ============================================================================

begin;

create table if not exists importer_procedures (
  id                   uuid primary key default gen_random_uuid(),
  importer_id          uuid not null references importers(id) on delete cascade,

  -- Matches a key in IMPORTER_RECORD_KINDS (lib/fsvp/importer-records.ts), so
  -- the obligation a procedure answers is the same identifier everywhere.
  kind                 text not null check (kind in (
                         'approved_supplier_procedures',
                         'records_procedures'
                       )),

  content              text not null,
  version              integer not null default 1 check (version > 0),

  status               text not null default 'draft'
                         check (status in ('draft', 'adopted', 'superseded')),

  -- § 1.510(a)(2): signed and dated. Adoption is the signature.
  adopted_at           timestamptz,
  adopted_by_profile_id uuid references profiles(id) on delete set null,
  superseded_at        timestamptz,

  -- What the draft was generated from, so a reader can tell an edited draft
  -- from an untouched one and know when the facts behind it were true.
  generated_at         timestamptz,
  edited_at            timestamptz,

  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- An adopted procedure must carry its signature; a draft must not claim one.
  constraint importer_procedures_adoption_check check (
    (status = 'adopted'    and adopted_at is not null and adopted_by_profile_id is not null)
    or (status = 'superseded' and adopted_at is not null)
    or (status = 'draft'   and adopted_at is null)
  )
);

-- One draft and one adopted version per kind. History is unlimited.
create unique index if not exists ux_importer_procedure_live
  on importer_procedures (importer_id, kind, status)
  where status in ('draft', 'adopted');

create index if not exists ix_importer_procedures_lookup
  on importer_procedures (importer_id, kind, status);

comment on table importer_procedures is
  'The importer''s own FSVP procedures, held as editable versioned records '
  'rather than uploaded files. Adoption is the § 1.510(a)(2) signature. '
  'Superseding never deletes: an investigator may ask which procedure was in '
  'force when a given approval was made.';

alter table importer_procedures enable row level security;

-- Same shape as every other importer-scoped table: the owning tenant reads and
-- writes, platform reviewers read, administrators do both.
create policy importer_procedures_read on importer_procedures
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

-- current_importer_ids_write() excludes tenant reviewers deliberately: a
-- qualified individual signs determinations, but adopting the organization's
-- procedures is the importer's own act.
create policy importer_procedures_write on importer_procedures
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()));

commit;
