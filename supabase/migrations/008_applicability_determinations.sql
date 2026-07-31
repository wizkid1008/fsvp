-- ============================================================================
-- 008_applicability_determinations.sql — does FSVP apply to this food at all?
--
-- The platform assumed every supplier/product pair needed a full FSVP record.
-- 21 CFR 1.501 exempts whole categories outright — juice and seafood already
-- under HACCP, food for research, transshipment, USDA-regulated meat — and
-- §§ 1.511–1.513 grant reduced requirements to very small importers, small
-- foreign suppliers, dietary supplements, and food from countries with a
-- recognized or equivalent food safety system.
--
-- Two things follow. An importer can now record that a food is exempt, which is
-- itself a record FDA asks for. And the § 1.503 gate from 005 stops demanding a
-- hazard analysis and supplier evaluation signature on records where § 1.512
-- does not require that work — the gate reads the determination
-- (see requiredTypesFor in lib/fsvp/qi-attestation.ts).
--
-- The basis is enumerated, not free text, so the gate can reason about it and
-- the citation printed in a records request is the right one. The authoritative
-- list lives in lib/fsvp/applicability.ts; the check constraint below mirrors it.
-- ============================================================================

begin;

-- ── Entity size ────────────────────────────────────────────────────────────
-- "Very small importer" is the most-claimed basis for modified requirements and
-- rests entirely on a three-year average. Recording it makes the claim
-- supported rather than asserted.

create table entity_size_determinations (
  id                    uuid primary key default gen_random_uuid(),
  importer_id           uuid not null references importers(id) on delete cascade,
  category              text not null default 'very_small_importer'
                          check (category in ('very_small_importer')),
  -- The § 1.500 thresholds differ for human and animal food.
  food_scope            text not null check (food_scope in ('human', 'animal')),
  three_year_average    numeric(14,2) not null check (three_year_average >= 0),
  currency              text not null default 'USD',
  basis_notes           text,
  determined_at         date not null default current_date,
  reaffirmed_at         date,
  expires_at            date,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index ix_entity_size_importer on entity_size_determinations (importer_id);

-- ── Applicability ──────────────────────────────────────────────────────────

create table fsvp_applicability_determinations (
  id                    uuid primary key default gen_random_uuid(),
  importer_id           uuid not null references importers(id) on delete cascade,
  supplier_id           uuid not null references suppliers(id) on delete restrict,
  product_id            uuid not null references products_verify(id) on delete restrict,

  outcome               text not null check (outcome in ('in_scope', 'exempt', 'modified')),
  basis                 text not null check (basis in (
                          'standard',
                          -- § 1.501 exemptions
                          'juice_haccp', 'seafood_haccp', 'research_evaluation',
                          'personal_consumption', 'alcoholic_beverage',
                          'processing_and_export', 'us_origin_returned',
                          'transshipment', 'usda_regulated',
                          -- §§ 1.511–1.513 modified requirements
                          'very_small_importer', 'small_foreign_supplier',
                          'recognized_country_system', 'dietary_supplement'
                        )),
  -- Written by the server from lib/fsvp/applicability.ts, never taken from the
  -- client, so a determination cannot cite a section that does not say what it
  -- claims.
  citation              text not null,
  rationale             text not null,

  entity_size_determination_id uuid references entity_size_determinations(id) on delete set null,
  qualified_individual_id      uuid not null references qualified_individuals(id) on delete restrict,

  determined_at         timestamptz not null default now(),
  expires_at            date,
  superseded_at         timestamptz,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One live determination per pair. Superseded rows stay: an FDA investigator is
-- entitled to see that a food was once determined exempt and no longer is.
create unique index ux_applicability_live
  on fsvp_applicability_determinations (importer_id, supplier_id, product_id)
  where superseded_at is null;

create index ix_applicability_expiry on fsvp_applicability_determinations (expires_at)
  where superseded_at is null and expires_at is not null;

-- A very small importer claim must point at the three-year average behind it.
-- Enforced here as well as in the API because it is the claim most likely to be
-- made on assertion alone.
create or replace function public.enforce_applicability_substantiation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_size record;
begin
  if new.basis = 'very_small_importer' then
    if new.entity_size_determination_id is null then
      raise exception
        'A very small importer determination must reference the entity size determination that supports it.';
    end if;

    select importer_id into v_size
    from entity_size_determinations
    where id = new.entity_size_determination_id;

    if not found or v_size.importer_id <> new.importer_id then
      raise exception 'The entity size determination belongs to a different importer.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_applicability_substantiation
  before insert or update on fsvp_applicability_determinations
  for each row execute function public.enforce_applicability_substantiation();

create trigger trg_entity_size_updated_at
  before update on entity_size_determinations
  for each row execute function public.set_updated_at();
create trigger trg_applicability_updated_at
  before update on fsvp_applicability_determinations
  for each row execute function public.set_updated_at();

-- ── Extend the signature ledger ────────────────────────────────────────────
-- qi_attestations was built in 005 as the seed of the § 1.510(b) signature
-- ledger. An applicability determination is signed by a QI too, and it exists
-- BEFORE any FSVP record — so rather than start a second ledger and undo that,
-- the existing one gains a second kind of target.

alter table qi_attestations
  alter column fsvp_record_id drop not null;

alter table qi_attestations
  add column applicability_determination_id uuid
    references fsvp_applicability_determinations(id) on delete cascade;

alter table qi_attestations
  add constraint qi_attestation_one_target check (
    (fsvp_record_id is not null and applicability_determination_id is null)
    or (fsvp_record_id is null and applicability_determination_id is not null)
  );

-- Found by definition rather than by name: the constraint in 005 was written
-- inline on the column, so its name is generated, and guessing wrong would fail
-- the whole migration.
do $$
declare v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'qi_attestations'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%attestation_type%';

  if v_name is not null then
    execute format('alter table qi_attestations drop constraint %I', v_name);
  end if;
end $$;

alter table qi_attestations add constraint qi_attestations_attestation_type_check
  check (attestation_type in (
    'hazard_analysis', 'supplier_evaluation',
    'verification_determination', 'reassessment',
    'applicability_determination'
  ));

create index ix_qi_att_applicability
  on qi_attestations (applicability_determination_id, attestation_type)
  where revoked_at is null;

-- Same rules as before, now branching on which target the row carries.
create or replace function public.enforce_qi_signer()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_qi              record;
  v_target_importer uuid;
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

  if new.fsvp_record_id is not null then
    select importer_id into v_target_importer from fsvp_records where id = new.fsvp_record_id;
  else
    select importer_id into v_target_importer
    from fsvp_applicability_determinations where id = new.applicability_determination_id;
  end if;

  if v_target_importer is distinct from new.importer_id then
    raise exception 'The signed record belongs to a different importer than the attestation.';
  end if;

  -- A lapsed or not-yet-active QI cannot produce a NEW signature. Historical
  -- attestations stay valid: they were made when the person was qualified.
  if new.signed_at::date < v_qi.active_from
     or (v_qi.active_to is not null and new.signed_at::date > v_qi.active_to) then
    raise exception
      'This qualified individual was not active on % (active % to %).',
      new.signed_at::date, v_qi.active_from, coalesce(v_qi.active_to::text, 'open');
  end if;

  return new;
end;
$$;

create or replace function public.enforce_qi_attestation_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id                      is distinct from old.id
     or new.importer_id                    is distinct from old.importer_id
     or new.qualified_individual_id        is distinct from old.qualified_individual_id
     or new.fsvp_record_id                 is distinct from old.fsvp_record_id
     or new.applicability_determination_id is distinct from old.applicability_determination_id
     or new.attestation_type               is distinct from old.attestation_type
     or new.statement                      is distinct from old.statement
     or new.content_snapshot               is distinct from old.content_snapshot
     or new.content_hash                   is distinct from old.content_hash
     or new.signed_by_profile_id           is distinct from old.signed_by_profile_id
     or new.signed_at                      is distinct from old.signed_at
     or new.created_at                     is distinct from old.created_at
  then
    raise exception 'Attestations are append-only. Revoke it and sign again instead of editing.';
  end if;

  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'This attestation is already revoked.';
  end if;

  return new;
end;
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table entity_size_determinations         enable row level security;
alter table fsvp_applicability_determinations  enable row level security;

-- Entity size is the importer's own commercial data: readable by the tenant,
-- writable only by the importer side. current_importer_ids_write() excludes
-- reviewers, so a qualified individual can read the figure they are relying on
-- but cannot set it.
create policy entity_size_read on entity_size_determinations
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

create policy entity_size_write on entity_size_determinations
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()));

-- Determinations use the unrestricted helper: making one is a qualified
-- individual's job, the same as signing an attestation.
create policy applicability_read on fsvp_applicability_determinations
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
    -- the exporter can see determinations naming them, so they know whether
    -- their food is in scope at all
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

create policy applicability_write on fsvp_applicability_determinations
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

commit;
