-- ============================================================================
-- 005_qualified_individuals.sql — QI register and attestation ledger
--
-- 21 CFR § 1.503 requires a qualified individual to perform or oversee the
-- hazard analysis (§ 1.504), the foreign supplier evaluation (§ 1.505) and the
-- verification activities determination (§ 1.506). § 1.510(b) requires those
-- records to be signed and dated. Until now nothing in the platform recorded
-- who was qualified, or that anyone had signed at all — an FSVP record could
-- reach importer_approved with no attestation behind it.
--
-- Two tables:
--
--   qualified_individuals — the register. profile_id is NOT NULL: a QI must
--     have a login, because a signature from an identity that cannot
--     authenticate is not a signature. External consultants get a login as a
--     tenant-scoped reviewer (see 004_reviewer_tenancy.sql).
--
--   qi_attestations — the ledger. Append-only. Each row snapshots the exact
--     text that was signed and its SHA-256, so editing a narrative after
--     signing does not silently leave a signature attached to text that no
--     longer exists — the gate in lib/fsvp/qi-attestation.ts detects the hash
--     mismatch and blocks approval until the QI re-signs.
--
-- The dated-snapshot and expiry principles are the same ones the rules engine
-- already uses for rule_versions: what was known and signed at the time, not a
-- live query.
-- ============================================================================

begin;

-- ── Register ───────────────────────────────────────────────────────────────

create table qualified_individuals (
  id                      uuid primary key default gen_random_uuid(),
  importer_id             uuid not null references importers(id) on delete cascade,
  -- Not null by design: only someone who can authenticate can sign.
  profile_id              uuid not null references profiles(id) on delete restrict,
  qualification_basis     text not null
                            check (qualification_basis in
                              ('education', 'training', 'experience', 'combination')),
  education               text,
  training                text,
  experience              text,
  languages               text[],
  -- Commodity, process or supplier scope this person is qualified for. Empty
  -- means unrestricted within the tenant.
  scope                   text[],
  credentials_document_id uuid references documents(id) on delete set null,
  active_from             date not null default current_date,
  active_to               date,
  created_by_profile_id   uuid references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (importer_id, profile_id),
  constraint qi_active_window check (active_to is null or active_to >= active_from)
);

create index ix_qi_importer on qualified_individuals (importer_id);
create index ix_qi_profile  on qualified_individuals (profile_id);

-- ── Attestation ledger ─────────────────────────────────────────────────────

create table qi_attestations (
  id                      uuid primary key default gen_random_uuid(),
  importer_id             uuid not null references importers(id) on delete cascade,
  qualified_individual_id uuid not null references qualified_individuals(id) on delete restrict,
  fsvp_record_id          uuid not null references fsvp_records(id) on delete cascade,
  attestation_type        text not null
                            check (attestation_type in
                              ('hazard_analysis', 'supplier_evaluation',
                               'verification_determination', 'reassessment')),
  -- What the QI actually asserted, and the text they asserted it about.
  statement               text not null,
  content_snapshot        text not null,
  content_hash            text not null,
  signed_by_profile_id    uuid not null references profiles(id) on delete restrict,
  signed_at               timestamptz not null default now(),
  revoked_at              timestamptz,
  revoked_reason          text,
  created_at              timestamptz not null default now()
);

create index ix_qi_att_record on qi_attestations (fsvp_record_id, attestation_type)
  where revoked_at is null;
create index ix_qi_att_qi on qi_attestations (qualified_individual_id);

-- ── Integrity: the signer must be the QI, and must have been active ────────

create or replace function public.enforce_qi_signer()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_qi record;
  v_record_importer uuid;
begin
  select profile_id, importer_id, active_from, active_to
    into v_qi
  from qualified_individuals
  where id = new.qualified_individual_id;

  if not found then
    raise exception 'Attestation references an unknown qualified individual.';
  end if;

  if new.signed_by_profile_id <> v_qi.profile_id then
    raise exception
      'An attestation must be signed by the qualified individual themselves (expected profile %, got %).',
      v_qi.profile_id, new.signed_by_profile_id;
  end if;

  if new.importer_id <> v_qi.importer_id then
    raise exception 'The qualified individual belongs to a different importer than the attestation.';
  end if;

  select importer_id into v_record_importer from fsvp_records where id = new.fsvp_record_id;
  if v_record_importer is distinct from new.importer_id then
    raise exception 'The FSVP record belongs to a different importer than the attestation.';
  end if;

  -- A lapsed or not-yet-active QI cannot produce a NEW signature. Historical
  -- attestations stay valid: they were made when the person was qualified, and
  -- rewriting that would misrepresent what was known at the time.
  if new.signed_at::date < v_qi.active_from
     or (v_qi.active_to is not null and new.signed_at::date > v_qi.active_to) then
    raise exception
      'This qualified individual was not active on % (active % to %).',
      new.signed_at::date, v_qi.active_from, coalesce(v_qi.active_to::text, 'open');
  end if;

  return new;
end;
$$;

create trigger trg_qi_attestations_signer
  before insert on qi_attestations
  for each row execute function public.enforce_qi_signer();

-- Append-only: the only permitted mutation is revocation. Everything else about
-- a signature is immutable, which is what makes the ledger worth anything in an
-- FDA records request.
create or replace function public.enforce_qi_attestation_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id                      is distinct from old.id
     or new.importer_id             is distinct from old.importer_id
     or new.qualified_individual_id is distinct from old.qualified_individual_id
     or new.fsvp_record_id          is distinct from old.fsvp_record_id
     or new.attestation_type        is distinct from old.attestation_type
     or new.statement               is distinct from old.statement
     or new.content_snapshot        is distinct from old.content_snapshot
     or new.content_hash            is distinct from old.content_hash
     or new.signed_by_profile_id    is distinct from old.signed_by_profile_id
     or new.signed_at               is distinct from old.signed_at
     or new.created_at              is distinct from old.created_at
  then
    raise exception 'Attestations are append-only. Revoke it and sign again instead of editing.';
  end if;

  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'This attestation is already revoked.';
  end if;

  return new;
end;
$$;

create trigger trg_qi_attestations_append_only
  before update on qi_attestations
  for each row execute function public.enforce_qi_attestation_append_only();

create trigger trg_qualified_individuals_updated_at
  before update on qualified_individuals
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table qualified_individuals enable row level security;
alter table qi_attestations       enable row level security;

-- The register is maintained by the importer. current_importer_ids_write()
-- excludes reviewers, so a QI cannot edit their own credentials or extend their
-- own active window.
create policy qi_read on qualified_individuals
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

create policy qi_write on qualified_individuals
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()));

-- Attestations use current_importer_ids() — the unrestricted helper — because
-- signing is precisely what a tenant QI is here to do. No delete policy: the
-- ledger is never erased.
create policy qi_attestations_read on qi_attestations
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

create policy qi_attestations_insert on qi_attestations
  for insert to authenticated
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

create policy qi_attestations_revoke on qi_attestations
  for update to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

commit;
