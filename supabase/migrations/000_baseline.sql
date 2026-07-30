-- ============================================================================
-- 000_baseline.sql — ThrushCross Verify consolidated schema baseline
--
-- Replaces migrations 001–044, which are preserved verbatim under
-- supabase/migrations/archive/ for historical reference.
--
-- Why this exists: migrations 001–013 modeled a broad FSVP/ITDS domain,
-- migration 014 replaced the supplier-facing half with a simpler model, and the
-- importer half was never rebuilt to match. Roughly fifteen of the 44 migrations
-- existed only to patch earlier ones, which made every RLS question a forensic
-- exercise across five files. This file is the intended end state, stated once.
--
-- Deliberately KEPT although currently unused by the app:
--   importer_entry_identities, import_entries — the 21 CFR 1.509 backbone for
--   FSVP importer identity at CBP entry. See docs/importer-workflow-analysis.md.
--
-- Deliberately DROPPED (the old migration 044 list): foreign_suppliers, foods,
--   organizations, user_roles, qualified_individuals, hazard_library, reviews,
--   document_versions, subscription_entitlements, commodities, and the rest of
--   the pre-014 domain. None had a single .from("…") reference in app code.
--
-- Reference data (countries, rule versions, requirement items, document
-- categories, app settings) lives in 001_reference_data.sql. The app cannot
-- function without it — a published rule version is required to create an
-- FSVP record.
-- ============================================================================

begin;

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================================
-- 1. Enums
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum
      ('supplier', 'exporter', 'us_importer', 'reviewer', 'administrator');
  end if;

  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type user_status as enum ('active', 'pending', 'suspended');
  end if;

  -- Used by documents.approval_status and requirement_evidence.status.
  if not exists (select 1 from pg_type where typname = 'evidence_status') then
    create type evidence_status as enum (
      'not_started', 'missing', 'uploaded', 'under_review', 'accepted',
      'rejected', 'revision_required', 'complete'
    );
  end if;
end $$;

-- ============================================================================
-- 2. Shared helper functions
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 3. Tenancy — importers
-- ============================================================================

create table importers (
  id                       uuid primary key default gen_random_uuid(),
  legal_name               text not null,
  display_name             text not null,
  ein                      text,
  -- D-U-N-S used as the FSVP importer identifier at CBP entry (§ 1.509).
  duns_number              text,
  food_scope               text not null default 'human'
                             check (food_scope in ('human', 'animal', 'both')),
  timezone                 text not null default 'America/New_York',
  address_json             jsonb not null default '{}'::jsonb,
  primary_contact_email    text,
  stripe_customer_id       text,
  status                   text not null default 'active'
                             check (status in ('active', 'suspended', 'closed')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on column importers.duns_number is
  'D-U-N-S number transmitted as the FSVP importer UFI at entry (21 CFR 1.509). '
  'Entity role code FSV.';

-- Effective-dated CBP identity (§ 1.509). Not yet wired to the UI; retained as
-- the correct home for entry-identity history when entry-line workflow lands.
create table importer_entry_identities (
  id              uuid primary key default gen_random_uuid(),
  importer_id     uuid not null references importers(id) on delete cascade,
  duns_number     text not null,
  contact_email   text not null,
  contact_name    text not null,
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,
  created_at      timestamptz not null default now()
);

create unique index ux_importer_current_identity
  on importer_entry_identities (importer_id) where effective_to is null;
create index ix_importer_identity_window
  on importer_entry_identities (importer_id, effective_from, effective_to);

-- ============================================================================
-- 4. Profiles (Supabase Auth bridge)
-- ============================================================================

create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  importer_id         uuid references importers(id) on delete set null,
  supplier_id         uuid,  -- FK added after suppliers exists
  full_name           text,
  email               text not null,
  organization_name   text,
  position            text,
  phone_number        text,
  country             text,
  preferred_language  text not null default 'en',
  role                app_role not null default 'supplier',
  user_status         user_status not null default 'pending',
  last_login_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index ix_profiles_importer on profiles (importer_id) where importer_id is not null;
create index ix_profiles_supplier on profiles (supplier_id) where supplier_id is not null;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'administrator'
      and user_status = 'active'
  );
$$;

-- The set of importer tenants the current user belongs to. Previously this also
-- unioned importer_users (a pre-014 table that no longer exists); a profile's
-- own importer_id is now the single source of truth.
create or replace function public.current_importer_ids()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select importer_id from profiles
  where id = auth.uid() and importer_id is not null;
$$;

-- Signup metadata allowlist: only 'supplier' and 'us_importer' are honored.
-- Reviewer/administrator must be assigned by an existing administrator, or
-- anyone calling supabase.auth.signUp() directly could self-elevate.
--
-- NOTE: importer accounts get NO importer_id here. The organization is created
-- by an administrator at approval time (see /api/admin/approve-importer). The
-- old auto_link_importer trigger assigned every importer the first importers row
-- on the platform, which collapsed all tenants into one.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data->>'role';
  safe_role      app_role;
begin
  safe_role := case
    when requested_role in ('supplier', 'us_importer') then requested_role::app_role
    else 'supplier'::app_role
  end;

  insert into public.profiles (id, email, full_name, organization_name, country, role, user_status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'organization_name', ''),
    nullif(new.raw_user_meta_data->>'country', ''),
    safe_role,
    'pending'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admins cannot change their own role, status, or tenancy. supplier_id may
-- be set once (NULL → value) so an invite claim can persist the initial link.
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_platform_admin() then
    return new;
  end if;

  new.role        := old.role;
  new.user_status := old.user_status;
  new.importer_id := old.importer_id;

  if old.supplier_id is not null then
    new.supplier_id := old.supplier_id;
  end if;

  return new;
end;
$$;

create trigger trg_profiles_prevent_role_escalation
  before update on profiles
  for each row execute function public.prevent_profile_role_escalation();

-- ============================================================================
-- 5. Reference: countries
-- ============================================================================

create table countries (
  country_code  text primary key check (country_code ~ '^[A-Z]{2}$'),
  country_name  text not null unique,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================================
-- 6. Suppliers / exporters
--
-- `suppliers` is a shared, global entity — not importer-owned. Importers relate
-- to it through supplier_relationships. `importer_id` survives only as the
-- creator hint on importer-managed records; `managed_by_importer_id` is the
-- authoritative ownership column.
-- ============================================================================

create table suppliers (
  id                      uuid primary key default gen_random_uuid(),
  company_name            text not null,
  legal_entity_name       text,
  registration_number     text,
  country                 text not null,
  address_json            jsonb not null default '{}'::jsonb,
  website                 text,
  contact_json            jsonb not null default '{}'::jsonb,
  export_markets          text[],
  product_categories      text[],
  fda_registration_number text,

  supplier_type           text not null default 'manufacturer'
    check (supplier_type in
      ('exporter', 'exporter_manufacturer', 'manufacturer', 'trader', 'broker')),

  certification_status    text not null default 'pending_review'
    check (certification_status in
      ('active', 'pending_review', 'approved', 'rejected', 'suspended')),
  approval_status         text not null default 'pending_review'
    check (approval_status in
      ('active', 'pending_review', 'approved', 'rejected', 'suspended')),
  portal_status           text not null default 'active'
    check (portal_status in ('active', 'pending', 'suspended')),

  -- ── Record ownership ────────────────────────────────────────────────
  -- self_managed     : the exporter registered and owns this record
  -- importer_managed : an importer created it; no exporter account exists
  -- claim_pending    : importer created it, claim invite outstanding
  record_mode             text not null default 'self_managed'
    check (record_mode in ('self_managed', 'importer_managed', 'claim_pending')),
  managed_by_importer_id  uuid references importers(id) on delete set null,
  claim_invite_token      text unique,
  claim_invite_sent_at    timestamptz,
  claimed_at              timestamptz,
  claim_declined_at       timestamptz,
  created_by_profile_id   uuid references profiles(id) on delete set null,

  -- ── Entry identity (§ 1.509) ────────────────────────────────────────
  duns_number             text,
  ufi_number              text,
  fsvp_identifier         text,

  readiness_score         numeric(5,2),
  last_reviewed_at        timestamptz,
  rule_version_id         uuid,  -- FK added after rule_versions exists

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- A managed record must name its manager; a self-managed one must not.
  constraint suppliers_managed_by_check check (
    (record_mode = 'self_managed' and managed_by_importer_id is null)
    or (record_mode in ('importer_managed', 'claim_pending')
        and managed_by_importer_id is not null)
  )
);

create index ix_suppliers_type    on suppliers (supplier_type);
create index ix_suppliers_managed on suppliers (managed_by_importer_id)
  where managed_by_importer_id is not null;
create index ix_suppliers_claim_token on suppliers (claim_invite_token)
  where claim_invite_token is not null;
-- Duplicate detection for find-or-create in /api/exporters/create.
create index ix_suppliers_name_country on suppliers (lower(company_name), country);

comment on column suppliers.record_mode is
  'Who owns this record. importer_managed means no exporter account exists and '
  'the managing importer uploads evidence on their behalf — see documents.evidence_source.';

alter table profiles
  add constraint profiles_supplier_id_fkey
  foreign key (supplier_id) references suppliers(id) on delete set null;

-- ── Relationships: importer↔exporter and exporter↔upstream supplier ──────

create table supplier_relationships (
  id                    uuid primary key default gen_random_uuid(),
  relationship_type     text not null
    check (relationship_type in ('importer_supplier', 'exporter_supplier')),

  importer_id           uuid references importers(id) on delete cascade,
  exporter_id           uuid references suppliers(id) on delete cascade,
  supplier_id           uuid not null references suppliers(id) on delete cascade,

  status                text not null default 'active'
    check (status in ('pending_invite', 'active', 'paused', 'declined', 'terminated')),

  invite_email          text,
  invite_token          text unique,
  invite_sent_at        timestamptz,
  accepted_at           timestamptz,
  declined_at           timestamptz,

  linked_by_profile_id  uuid references profiles(id) on delete set null,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  check (
    (relationship_type = 'importer_supplier' and importer_id is not null and exporter_id is null)
    or
    (relationship_type = 'exporter_supplier' and exporter_id is not null and importer_id is null)
  ),
  unique (importer_id, supplier_id),
  unique (exporter_id, supplier_id),
  check (exporter_id is null or exporter_id <> supplier_id)
);

create index ix_sr_importer on supplier_relationships (importer_id) where importer_id is not null;
create index ix_sr_exporter on supplier_relationships (exporter_id) where exporter_id is not null;
create index ix_sr_supplier on supplier_relationships (supplier_id);
create index ix_sr_type     on supplier_relationships (relationship_type);
create index ix_sr_status   on supplier_relationships (status);
create index ix_sr_token    on supplier_relationships (invite_token) where invite_token is not null;

create or replace function public.is_export_eligible(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from suppliers
    where id = p_supplier_id
      and supplier_type in ('exporter', 'exporter_manufacturer', 'trader')
  );
$$;

-- Only export-eligible entities may be linked directly to a US importer.
-- A pure manufacturer or broker must flow through an exporter.
create or replace function public.validate_exporter_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.relationship_type = 'importer_supplier'
     and not public.is_export_eligible(new.supplier_id) then
    raise exception
      'Only exporters, traders, or exporter-manufacturers can be linked to importers. '
      'Supplier type (%) is not export-eligible.',
      (select supplier_type from suppliers where id = new.supplier_id);
  end if;
  return new;
end;
$$;

create trigger trg_validate_exporter_link
  before insert or update on supplier_relationships
  for each row execute function public.validate_exporter_link();

create or replace function public.is_linked_supplier(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from supplier_relationships
    where relationship_type = 'exporter_supplier'
      and status = 'active'
      and (
        (exporter_id in (
          select supplier_id from profiles
          where id = auth.uid() and supplier_id is not null
        ) and supplier_id = p_supplier_id)
        or
        (supplier_id in (
          select supplier_id from profiles
          where id = auth.uid() and supplier_id is not null
        ) and exporter_id = p_supplier_id)
      )
  );
$$;

-- ============================================================================
-- 7. Facilities and products
-- ============================================================================

create table facilities_verify (
  id                      uuid primary key default gen_random_uuid(),
  importer_id             uuid references importers(id) on delete cascade,
  supplier_id             uuid references suppliers(id) on delete cascade,
  facility_name           text not null,
  facility_address_json   jsonb not null default '{}'::jsonb,
  facility_type           text not null,
  fda_registration_number text,
  production_capacity     text,
  manufacturing_processes text,
  food_safety_certifications text[],
  readiness_score         numeric(5,2),
  approval_status         text not null default 'pending'
    check (approval_status in (
      'pending', 'approved', 'conditionally_approved',
      'improvement_required', 'not_approved', 'suspended'
    )),
  rule_version_id         uuid,  -- FK added after rule_versions exists
  last_reviewed_at        timestamptz,
  reviewed_by_profile_id  uuid references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index ix_facilities_supplier on facilities_verify (supplier_id);

-- Facilities can be shared across suppliers in the same chain.
create table facility_supplier_access (
  id                    uuid primary key default gen_random_uuid(),
  facility_id           uuid not null references facilities_verify(id) on delete cascade,
  supplier_id           uuid not null references suppliers(id) on delete cascade,
  importer_id           uuid references importers(id) on delete cascade,
  access_level          text not null default 'manage'
                          check (access_level in ('view', 'manage')),
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (facility_id, supplier_id)
);

create index ix_fsa_facility on facility_supplier_access (facility_id);
create index ix_fsa_supplier on facility_supplier_access (supplier_id);

create table products_verify (
  id                      uuid primary key default gen_random_uuid(),
  importer_id             uuid references importers(id) on delete cascade,
  supplier_id             uuid references suppliers(id) on delete cascade,
  facility_id             uuid references facilities_verify(id) on delete set null,
  product_name            text not null,
  product_description     text,
  country_of_origin       text,
  raw_or_processed        text check (raw_or_processed in ('raw', 'processed', 'both')),
  intended_use            text check (intended_use in
                            ('ready_to_eat', 'further_processed', 'animal_feed', 'ingredient', 'other')),
  ingredient_list         text,
  product_specifications  text,
  shelf_life              text,
  packaging_information   text,
  allergen_information    text,
  readiness_score         numeric(5,2),
  approval_status         text not null default 'pending'
    check (approval_status in (
      'pending', 'approved', 'conditionally_approved',
      'improvement_required', 'not_approved'
    )),
  rule_version_id         uuid,  -- FK added after rule_versions exists
  last_reviewed_at        timestamptz,
  reviewed_by_profile_id  uuid references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index ix_products_supplier on products_verify (supplier_id);
create index ix_products_facility on products_verify (facility_id);

-- ============================================================================
-- 8. Rules engine
-- ============================================================================

create table rule_sets (
  id                    uuid primary key default gen_random_uuid(),
  set_name              text not null unique,
  description           text,
  applies_to            text not null
                          check (applies_to in ('facility', 'product', 'fsvp_record', 'all')),
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table rule_versions (
  id                     uuid primary key default gen_random_uuid(),
  rule_set_id            uuid not null references rule_sets(id) on delete cascade,
  version_number         int not null,
  status                 text not null default 'draft'
                           check (status in ('draft', 'published', 'archived')),
  published_at           timestamptz,
  archived_at            timestamptz,
  cloned_from_version_id uuid references rule_versions(id) on delete set null,
  notes                  text,
  created_by_profile_id  uuid references profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (rule_set_id, version_number)
);

alter table suppliers
  add constraint suppliers_rule_version_fkey
  foreign key (rule_version_id) references rule_versions(id) on delete set null;
alter table facilities_verify
  add constraint facilities_rule_version_fkey
  foreign key (rule_version_id) references rule_versions(id) on delete set null;
alter table products_verify
  add constraint products_rule_version_fkey
  foreign key (rule_version_id) references rule_versions(id) on delete set null;

create table approval_thresholds (
  id               uuid primary key default gen_random_uuid(),
  rule_version_id  uuid not null references rule_versions(id) on delete cascade,
  label            text not null,
  min_score        numeric(5,2) not null,
  max_score        numeric(5,2) not null,
  resulting_status text not null,
  created_at       timestamptz not null default now(),
  unique (rule_version_id, label)
);

create table requirement_sections (
  id              uuid primary key default gen_random_uuid(),
  rule_version_id uuid not null references rule_versions(id) on delete cascade,
  section_key     text not null,
  section_name    text not null,
  applies_to      text not null check (applies_to in ('facility', 'product', 'supplier')),
  description     text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (rule_version_id, section_key)
);

create table scoring_category_weights (
  id              uuid primary key default gen_random_uuid(),
  rule_version_id uuid not null references rule_versions(id) on delete cascade,
  section_id      uuid not null references requirement_sections(id) on delete cascade,
  weight_percent  numeric(5,2) not null check (weight_percent > 0 and weight_percent <= 100),
  created_at      timestamptz not null default now(),
  unique (rule_version_id, section_id)
);

create table requirement_items (
  id                  uuid primary key default gen_random_uuid(),
  section_id          uuid not null references requirement_sections(id) on delete cascade,
  item_key            text not null,
  item_name           text not null,
  description         text,
  evidence_type       text,
  is_required         boolean not null default true,
  is_critical_blocker boolean not null default false,
  auto_accept         boolean not null default false,
  expiration_applies  boolean not null default false,
  cfr_citation        text,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  unique (section_id, item_key)
);

-- Section weights must total 100% per rule_version + applies_to combination.
create or replace function public.validate_scoring_weights()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_applies_to text;
  v_total      numeric;
begin
  select rs.applies_to into v_applies_to
  from requirement_sections rs
  where rs.id = new.section_id;

  select coalesce(sum(w.weight_percent), 0) into v_total
  from scoring_category_weights w
  join requirement_sections s on s.id = w.section_id
  where w.rule_version_id = new.rule_version_id
    and s.applies_to = v_applies_to
    and w.id is distinct from new.id;

  if v_total + new.weight_percent > 100.001 then
    raise exception
      'Scoring weights for % sections in this rule version would exceed 100%% (current total: %, adding: %)',
      v_applies_to, v_total, new.weight_percent;
  end if;

  return new;
end;
$$;

create trigger trg_validate_scoring_weights
  before insert or update of weight_percent on scoring_category_weights
  for each row execute function public.validate_scoring_weights();

-- Published rule versions are immutable; clone into a draft to change them.
create or replace function public.prevent_published_rule_edit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rule_version_id uuid;
begin
  v_rule_version_id := coalesce(
    (case TG_TABLE_NAME
       when 'requirement_sections'     then old.rule_version_id
       when 'scoring_category_weights' then old.rule_version_id
       when 'requirement_items'        then (select rule_version_id from requirement_sections where id = old.section_id)
     end),
    (case TG_TABLE_NAME
       when 'requirement_sections'     then new.rule_version_id
       when 'scoring_category_weights' then new.rule_version_id
       when 'requirement_items'        then (select rule_version_id from requirement_sections where id = new.section_id)
     end)
  );

  if exists (select 1 from rule_versions where id = v_rule_version_id and status = 'published') then
    raise exception 'Published rule versions cannot be edited. Clone into a new draft first.';
  end if;

  return new;
end;
$$;

create trigger trg_requirement_sections_published_guard
  before update on requirement_sections
  for each row execute function public.prevent_published_rule_edit();
create trigger trg_scoring_weights_published_guard
  before update on scoring_category_weights
  for each row execute function public.prevent_published_rule_edit();
create trigger trg_requirement_items_published_guard
  before update on requirement_items
  for each row execute function public.prevent_published_rule_edit();

-- Legacy flat requirement list, still read by app/evidence and the upload route.
create table fsvp_requirements (
  id                      uuid primary key default gen_random_uuid(),
  requirement_key         text not null unique,
  requirement_name        text not null,
  requirement_description text not null,
  cfr_citation            text,
  required_evidence       text not null,
  active                  boolean not null default true,
  sort_order              int not null default 0,
  created_at              timestamptz not null default now()
);

-- ============================================================================
-- 9. Documents
-- ============================================================================

create table documents (
  id                      uuid primary key default gen_random_uuid(),
  importer_id             uuid references importers(id) on delete cascade,
  supplier_id             uuid references suppliers(id) on delete set null,
  facility_id             uuid references facilities_verify(id) on delete set null,

  document_kind           text not null,
  title                   text not null,
  description             text,
  storage_path            text not null,
  original_filename       text,
  mime_type               text not null,
  size_bytes              bigint not null,
  sha256                  text not null,
  language                text,

  linked_entity_type      text,
  linked_entity_id        uuid,
  related_requirement_id  uuid references fsvp_requirements(id) on delete set null,
  requirement_item_id     uuid references requirement_items(id) on delete set null,
  rule_version_id         uuid references rule_versions(id) on delete set null,

  -- Review workflow
  evidence_status         text not null default 'not_submitted'
    check (evidence_status in (
      'not_submitted', 'submitted', 'under_review', 'accepted',
      'needs_revision', 'rejected', 'expired'
    )),
  approval_status         evidence_status default 'uploaded',
  reviewer_profile_id     uuid references profiles(id) on delete set null,
  review_notes            text,
  expiration_date         date,

  -- ── Provenance ──────────────────────────────────────────────────────
  -- An FSVP record built on importer_uploaded evidence is not the same
  -- evidentiary artifact as one the supplier attested to. Keep them
  -- distinguishable: the export package prints this column.
  evidence_source         text not null default 'supplier_attested'
    check (evidence_source in ('supplier_attested', 'importer_uploaded', 'third_party')),
  attested_by_name        text,
  attested_at             timestamptz,

  retention_until         timestamptz,
  retention_locked        boolean not null default true,
  uploaded_by_profile_id  uuid references profiles(id) on delete set null,
  uploaded_via            text not null default 'app'
                            check (uploaded_via in ('app', 'supplier_portal', 'broker_api', 'system')),
  uploaded_at             timestamptz not null default now(),
  soft_deleted_at         timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index ix_documents_importer_kind on documents (importer_id, document_kind);
create index ix_documents_linked        on documents (linked_entity_type, linked_entity_id);
create index ix_documents_supplier      on documents (supplier_id)
  where supplier_id is not null and soft_deleted_at is null;
create index ix_documents_status        on documents (evidence_status)
  where soft_deleted_at is null;
create index ix_documents_expiry        on documents (expiration_date)
  where expiration_date is not null and soft_deleted_at is null;

comment on column documents.evidence_source is
  'supplier_attested = uploaded by the supplier themselves; importer_uploaded = '
  'uploaded by the importer on their behalf (see suppliers.record_mode); '
  'third_party = direct from a certification body, lab, or auditor.';

create table document_categories (
  id           uuid primary key default gen_random_uuid(),
  category_key text not null unique,
  label        text not null,
  description  text,
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table requirement_evidence (
  id                   uuid primary key default gen_random_uuid(),
  importer_id          uuid references importers(id) on delete cascade,
  supplier_id          uuid references suppliers(id) on delete cascade,
  product_id           uuid references products_verify(id) on delete cascade,
  facility_id          uuid references facilities_verify(id) on delete set null,
  requirement_id       uuid not null references fsvp_requirements(id) on delete cascade,
  document_id          uuid references documents(id) on delete set null,
  reviewer_profile_id  uuid references profiles(id) on delete set null,
  status               evidence_status not null default 'not_started',
  reviewer_notes       text,
  gap_status           text,
  final_determination  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ============================================================================
-- 10. Scoring
-- ============================================================================

create table scoring_results (
  id                        uuid primary key default gen_random_uuid(),
  entity_type               text not null
                              check (entity_type in ('facility', 'product', 'fsvp_record')),
  entity_id                 uuid not null,
  rule_version_id           uuid not null references rule_versions(id) on delete restrict,
  overall_score             numeric(5,2) not null default 0,
  section_scores            jsonb not null default '{}'::jsonb,
  is_stale                  boolean not null default false,
  critical_blockers_present boolean not null default false,
  calculated_at             timestamptz not null default now(),
  unique (entity_type, entity_id, rule_version_id)
);

-- ============================================================================
-- 11. FSVP records
-- ============================================================================

create table fsvp_records (
  id                         uuid primary key default gen_random_uuid(),
  importer_id                uuid not null references importers(id) on delete cascade,
  supplier_id                uuid not null references suppliers(id) on delete restrict,
  facility_id                uuid not null references facilities_verify(id) on delete restrict,
  product_id                 uuid not null references products_verify(id) on delete restrict,
  rule_version_id            uuid not null references rule_versions(id) on delete restrict,
  status                     text not null default 'draft'
    check (status in (
      'draft', 'awaiting_supplier_evidence', 'supplier_evidence_submitted',
      'supplier_evidence_accepted', 'importer_review_pending', 'importer_approved',
      'conditionally_approved', 'needs_corrective_action', 'rejected',
      'expired', 'reassessment_due'
    )),
  hazard_analysis_notes      text,
  supplier_evaluation_notes  text,
  facility_evaluation_notes  text,
  verification_determination text,
  overall_score              numeric(5,2),
  approval_decision          text
    check (approval_decision in ('approved', 'conditionally_approved', 'rejected')),
  approved_by_profile_id     uuid references profiles(id) on delete set null,
  approved_at                timestamptz,
  reassessment_due_at        timestamptz,
  created_by_profile_id      uuid references profiles(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (importer_id, supplier_id, facility_id, product_id)
);

create index ix_fsvp_records_importer on fsvp_records (importer_id);
create index ix_fsvp_records_supplier on fsvp_records (supplier_id);
create index ix_fsvp_records_reassess on fsvp_records (reassessment_due_at)
  where reassessment_due_at is not null;

create table fsvp_record_evidence (
  id                     uuid primary key default gen_random_uuid(),
  fsvp_record_id         uuid not null references fsvp_records(id) on delete cascade,
  document_id            uuid not null references documents(id) on delete restrict,
  requirement_item_id    uuid references requirement_items(id) on delete set null,
  attached_by_profile_id uuid references profiles(id) on delete set null,
  attached_at            timestamptz not null default now(),
  notes                  text,
  unique (fsvp_record_id, document_id)
);

create table approval_decisions (
  id                    uuid primary key default gen_random_uuid(),
  fsvp_record_id        uuid not null references fsvp_records(id) on delete cascade,
  importer_id           uuid not null references importers(id) on delete cascade,
  decision              text not null
    check (decision in ('approved', 'conditionally_approved', 'rejected', 'revision_requested')),
  decision_notes        text,
  conditions_text       text,
  decided_by_profile_id uuid not null references profiles(id) on delete restrict,
  decided_at            timestamptz not null default now(),
  rule_version_id       uuid not null references rule_versions(id) on delete restrict
);

create table reassessment_schedules (
  id               uuid primary key default gen_random_uuid(),
  fsvp_record_id   uuid not null references fsvp_records(id) on delete cascade,
  importer_id      uuid not null references importers(id) on delete cascade,
  frequency_months int not null default 12,
  last_assessed_at timestamptz,
  next_due_at      timestamptz not null,
  status           text not null default 'scheduled'
                     check (status in ('scheduled', 'overdue', 'completed', 'cancelled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Hazard analysis (§ 1.504) ──────────────────────────────────────────

create table fsvp_plan_hazard_analyses (
  id                             uuid primary key default gen_random_uuid(),
  fsvp_record_id                 uuid not null references fsvp_records(id) on delete cascade,
  version                        int not null default 1,
  status                         text not null default 'draft'
                                   check (status in ('draft', 'final', 'superseded')),
  methodology_notes              text,
  relied_on_other_party          boolean not null default false,
  relied_on_party_name           text,
  relied_on_document_id          uuid references documents(id) on delete set null,
  performed_by_name              text,
  performed_at                   timestamptz,
  next_reassessment_due_at       timestamptz,
  requires_supplier_verification boolean not null default true,
  verification_basis_notes       text,
  created_by_profile_id          uuid references profiles(id) on delete set null,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  unique (fsvp_record_id, version)
);

create index ix_fsvp_ha_record on fsvp_plan_hazard_analyses (fsvp_record_id);

create table fsvp_plan_hazard_items (
  id                 uuid primary key default gen_random_uuid(),
  hazard_analysis_id uuid not null references fsvp_plan_hazard_analyses(id) on delete cascade,
  hazard_type        text not null
                       check (hazard_type in ('biological', 'chemical', 'physical', 'radiological')),
  hazard_name        text not null,
  known_or_reasonably_foreseeable boolean not null default true,
  requires_control   boolean not null default false,
  severity           text check (severity in ('low', 'moderate', 'high')),
  probability        text check (probability in ('low', 'moderate', 'high')),
  is_sahcodha        boolean not null default false,
  controlling_entity text check (controlling_entity in
                       ('foreign_supplier', 'supplier_of_supplier', 'importer', 'customer')),
  controls_description text,
  created_at         timestamptz not null default now()
);

create index ix_fsvp_hazard_items_analysis on fsvp_plan_hazard_items (hazard_analysis_id);

-- ── Verification activities (§§ 1.506–1.507) ───────────────────────────

create table fsvp_verification_records (
  id                    uuid primary key default gen_random_uuid(),
  fsvp_record_id        uuid not null references fsvp_records(id) on delete cascade,
  activity_type         text not null
                          check (activity_type in
                            ('onsite_audit', 'sampling_testing', 'records_review',
                             'certificate_of_conformance', 'written_assurance', 'other')),
  scheduled_date        date,
  completed_at          timestamptz,
  result                text check (result in ('acceptable', 'unacceptable', 'inconclusive', 'pending')),
  result_notes          text,
  is_sahcodha_audit     boolean not null default false,
  document_id           uuid references documents(id) on delete set null,
  performed_by_name     text,
  next_due_at           date,
  status                text not null default 'planned'
                          check (status in ('planned', 'in_progress', 'completed', 'overdue', 'cancelled')),
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index ix_fsvp_vr_record on fsvp_verification_records (fsvp_record_id);
create index ix_fsvp_vr_due    on fsvp_verification_records (next_due_at)
  where status in ('planned', 'in_progress');

-- ── Score staleness triggers ───────────────────────────────────────────

create or replace function public.mark_scores_stale_on_evidence_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.facility_id is not null then
    update scoring_results set is_stale = true
    where entity_type = 'facility' and entity_id = new.facility_id;
  end if;

  if new.linked_entity_type = 'product' and new.linked_entity_id is not null then
    update scoring_results set is_stale = true
    where entity_type = 'product' and entity_id = new.linked_entity_id;
  end if;

  -- Any FSVP record holding this document also goes stale.
  update scoring_results set is_stale = true
  where entity_type = 'fsvp_record'
    and entity_id in (
      select fsvp_record_id from fsvp_record_evidence where document_id = new.id
    );

  return new;
end;
$$;

create trigger trg_documents_mark_scores_stale
  after update of evidence_status on documents
  for each row
  when (old.evidence_status is distinct from new.evidence_status)
  execute function public.mark_scores_stale_on_evidence_change();

create or replace function public.mark_fsvp_record_score_stale()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update scoring_results set is_stale = true
  where entity_type = 'fsvp_record' and entity_id = new.id;
  return new;
end;
$$;

create trigger trg_fsvp_record_status_stale
  after update of status on fsvp_records
  for each row
  when (old.status is distinct from new.status)
  execute function public.mark_fsvp_record_score_stale();

-- ============================================================================
-- 12. Corrective actions and reassessments
-- ============================================================================

create table corrective_actions (
  id                    uuid primary key default gen_random_uuid(),
  importer_id           uuid not null references importers(id) on delete cascade,
  supplier_id           uuid not null references suppliers(id) on delete restrict,
  product_id            uuid references products_verify(id) on delete set null,
  fsvp_record_id        uuid references fsvp_records(id) on delete set null,
  document_id           uuid references documents(id) on delete set null,
  triggered_by          text not null check (triggered_by in
                          ('verification_finding', 'recall', 'consumer_complaint',
                           'inspector_finding', 'reassessment', 'other')),
  triggered_at          timestamptz not null default now(),
  issue_description     text not null,
  investigation_summary text,
  action_taken          text,
  supplier_response     text,
  decision              text check (decision in
                          ('continued', 'temporary_suspension', 'discontinued')),
  closed_at             timestamptz,
  status                text not null default 'open'
                          check (status in ('open', 'in_progress', 'closed')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index ix_ca_importer on corrective_actions (importer_id, status);
create index ix_ca_supplier on corrective_actions (supplier_id);

create table fsvp_reassessments (
  id                       uuid primary key default gen_random_uuid(),
  importer_id              uuid not null references importers(id) on delete cascade,
  scope                    text not null check (scope in ('full_program', 'supplier', 'product')),
  target_supplier_id       uuid references suppliers(id) on delete set null,
  target_product_id        uuid references products_verify(id) on delete set null,
  triggered_by             text not null check (triggered_by in
                             ('scheduled_3yr', 'new_hazard_info', 'supplier_nonconformance',
                              'regulatory_change', 'recall', 'other')),
  findings                 text,
  changes_required         text,
  changes_implemented_at   timestamptz,
  performed_by_name        text,
  performed_at             timestamptz,
  next_reassessment_due_at timestamptz,
  status                   text not null default 'in_progress'
                             check (status in ('in_progress', 'completed', 'superseded')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ============================================================================
-- 13. Readiness, reports, notifications, audit
-- ============================================================================

create table readiness_assessments (
  id                    uuid primary key default gen_random_uuid(),
  importer_id           uuid not null references importers(id) on delete cascade,
  supplier_id           uuid not null references suppliers(id) on delete cascade,
  status                text not null default 'draft'
                          check (status in ('draft', 'submitted', 'under_review', 'revision_required', 'approved')),
  overall_score         numeric(5,2) not null default 0,
  gap_summary           text,
  recommended_actions   text,
  submitted_at          timestamptz,
  reviewed_at           timestamptz,
  reviewed_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table readiness_scores (
  id                      uuid primary key default gen_random_uuid(),
  importer_id             uuid not null references importers(id) on delete cascade,
  assessment_id           uuid not null references readiness_assessments(id) on delete cascade,
  category                text not null,
  score                   numeric(5,2) not null check (score >= 0 and score <= 100),
  weight_points           numeric(5,2),
  evidence_summary        text,
  gap_summary             text,
  critical_gap            text,
  recommended_action      text,
  recommended_next_action text,
  created_at              timestamptz not null default now(),
  unique (assessment_id, category)
);

create table generated_reports (
  id                      uuid primary key default gen_random_uuid(),
  importer_id             uuid not null references importers(id) on delete cascade,
  supplier_id             uuid references suppliers(id) on delete set null,
  fsvp_record_id          uuid references fsvp_records(id) on delete set null,
  report_type             text not null check (report_type in
                            ('supplier_readiness', 'compliance_gap', 'document_status',
                             'fsvp_record_package', 'audit', 'executive_summary')),
  export_format           text not null check (export_format in ('csv', 'html', 'pdf', 'excel')),
  title                   text not null,
  storage_path            text,
  generated_by_profile_id uuid references profiles(id) on delete set null,
  generated_at            timestamptz not null default now()
);

create table app_notifications (
  id                   uuid primary key default gen_random_uuid(),
  importer_id          uuid references importers(id) on delete cascade,
  supplier_id          uuid references suppliers(id) on delete cascade,
  recipient_profile_id uuid references profiles(id) on delete cascade,
  notification_type    text not null,
  title                text not null,
  body                 text,
  target_url           text,
  severity             text not null default 'info'
                         check (severity in ('info', 'warning', 'critical')),
  read_at              timestamptz,
  created_at           timestamptz not null default now()
);

create index ix_notifications_recipient on app_notifications (recipient_profile_id, read_at);

create table notification_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  importer_id         uuid references importers(id) on delete set null,
  channel             text not null default 'email'
                        check (channel in ('email', 'sms', 'in_app')),
  template_key        text not null,
  to_address          text not null,
  subject             text,
  provider_message_id text,
  target_entity_type  text,
  target_entity_id    uuid,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz,
  bounced_at          timestamptz,
  bounce_reason       text,
  failed_at           timestamptz,
  failure_reason      text,
  created_at          timestamptz not null default now()
);

create index ix_notif_target on notification_deliveries (target_entity_type, target_entity_id);

create table compliance_alerts (
  id                     uuid primary key default gen_random_uuid(),
  importer_id            uuid not null references importers(id) on delete cascade,
  fsvp_record_id         uuid references fsvp_records(id) on delete cascade,
  verification_record_id uuid references fsvp_verification_records(id) on delete cascade,
  document_id            uuid references documents(id) on delete cascade,
  alert_type             text not null check (alert_type in (
                           'reassessment_due', 'verification_due', 'document_expiring',
                           'corrective_action_open', 'supplier_approval_due', 'entry_filing_pending'
                         )),
  title                  text not null,
  description            text,
  due_date               date not null,
  severity               text not null default 'medium'
                           check (severity in ('low', 'medium', 'high', 'critical')),
  status                 text not null default 'open'
                           check (status in ('open', 'acknowledged', 'resolved', 'snoozed')),
  snoozed_until          date,
  resolved_at            timestamptz,
  resolved_by_profile_id uuid references profiles(id) on delete set null,
  auto_generated         boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index ix_compliance_alerts_importer_due
  on compliance_alerts (importer_id, due_date)
  where status in ('open', 'acknowledged');

create table background_reference_documents (
  id                        uuid primary key default gen_random_uuid(),
  title                     text not null,
  category                  text not null,
  storage_path              text not null,
  maintained_by_profile_id  uuid references profiles(id) on delete set null,
  active                    boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table audit_logs (
  id               uuid primary key default gen_random_uuid(),
  importer_id      uuid references importers(id) on delete set null,
  actor_profile_id uuid references profiles(id) on delete set null,
  actor_role       text,
  action           text not null,
  record_type      text,
  record_id        uuid,
  previous_value   jsonb,
  new_value        jsonb,
  ip_address       inet,
  user_agent       text,
  created_at       timestamptz not null default now()
);

create index ix_audit_logs_importer on audit_logs (importer_id, created_at desc);

create table app_settings (
  setting_key           text primary key,
  label                 text not null,
  detail                text,
  setting_type          text not null default 'boolean'
                          check (setting_type in ('boolean', 'text', 'number', 'json')),
  boolean_value         boolean,
  text_value            text,
  number_value          numeric,
  json_value            jsonb,
  category              text not null default 'workflow',
  sort_order            int not null default 0,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ============================================================================
-- 14. Import entries (§ 1.509) — retained, not yet wired to the UI
-- ============================================================================

create table import_entries (
  id                       uuid primary key default gen_random_uuid(),
  importer_id              uuid not null references importers(id) on delete cascade,
  supplier_id              uuid not null references suppliers(id) on delete restrict,
  product_id               uuid references products_verify(id) on delete set null,
  fsvp_record_id           uuid references fsvp_records(id) on delete set null,
  identity_used_id         uuid references importer_entry_identities(id) on delete set null,
  entry_number             text,
  entry_date               date,
  port_of_entry            text,
  quantity_text            text,
  declared_value_cents     bigint,
  customs_broker_name      text,
  -- FSVP affirmation transmitted at entry: FSV (subject), FSX (exempt),
  -- RNE (research/evaluation).
  fsvp_affirmation_code    text check (fsvp_affirmation_code in ('FSV', 'FSX', 'RNE')),
  pre_entry_check_passed   boolean,
  pre_entry_check_blockers jsonb,
  created_via              text not null default 'manual'
                             check (created_via in ('manual', 'broker_import', 'ace_integration')),
  created_at               timestamptz not null default now()
);

create index ix_entries_importer_date on import_entries (importer_id, entry_date desc);

-- ============================================================================
-- 15. Supplier record claiming
--
-- Replaces the old ensure_supplier_record_for_profile(), which matched a new
-- signup to an existing suppliers row on lower(company_name) = organization_name
-- with no country or email check. That was both a duplicate source and a
-- hijack vector: signing up with a matching organization_name inherited that
-- supplier record and all of its evidence. Claiming now requires a token.
-- ============================================================================

create or replace function public.ensure_supplier_record_for_profile(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_org_name    text;
  v_full_name   text;
  v_email       text;
  v_country     text;
begin
  select supplier_id into v_supplier_id from profiles where id = p_profile_id;
  if v_supplier_id is not null then
    return v_supplier_id;
  end if;

  select organization_name, full_name, email, country
    into v_org_name, v_full_name, v_email, v_country
  from profiles where id = p_profile_id;

  -- Always create a fresh record. Attaching to a pre-existing row happens only
  -- through an explicit claim token (see /api/exporters/[id]/claim).
  insert into suppliers (
    company_name, legal_entity_name, country, contact_json,
    supplier_type, record_mode
  ) values (
    coalesce(nullif(v_org_name, ''), nullif(v_full_name, ''), 'Unnamed Exporter'),
    nullif(v_org_name, ''),
    coalesce(nullif(v_country, ''), 'US'),
    jsonb_build_object('name', coalesce(v_full_name, ''), 'email', coalesce(v_email, '')),
    'exporter',
    'self_managed'
  )
  returning id into v_supplier_id;

  update profiles set supplier_id = v_supplier_id where id = p_profile_id;
  return v_supplier_id;
end;
$$;

-- A company that registers itself is an exporter: it holds the importer
-- relationship and manages its own supply chain. The 'supplier' role is
-- reserved for upstream manufacturers, who are created by an exporter through
-- /api/supplier-links/invite rather than by self-registration. The signup form
-- can only send 'supplier' or 'us_importer' (see handle_new_user), so the
-- promotion happens here.
create or replace function public.trg_auto_link_supplier_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid;
begin
  if new.role not in ('supplier', 'exporter') or new.supplier_id is not null then
    return new;
  end if;

  insert into suppliers (company_name, legal_entity_name, country, contact_json,
                         supplier_type, record_mode)
  values (
    coalesce(nullif(new.organization_name, ''), nullif(new.full_name, ''), 'Unnamed Exporter'),
    nullif(new.organization_name, ''),
    coalesce(nullif(new.country, ''), 'US'),
    jsonb_build_object('name', coalesce(new.full_name, ''), 'email', coalesce(new.email, '')),
    'exporter',
    'self_managed'
  )
  returning id into v_supplier_id;

  new.supplier_id := v_supplier_id;
  new.role        := 'exporter';
  return new;
end;
$$;

create trigger trg_auto_link_supplier_profile
  before insert on profiles
  for each row execute function public.trg_auto_link_supplier_profile();

-- ============================================================================
-- 16. updated_at triggers
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'importers', 'profiles', 'suppliers', 'supplier_relationships',
    'facilities_verify', 'products_verify', 'documents', 'document_categories',
    'requirement_evidence', 'rule_sets', 'rule_versions', 'fsvp_records',
    'reassessment_schedules', 'fsvp_plan_hazard_analyses', 'fsvp_verification_records',
    'corrective_actions', 'fsvp_reassessments', 'readiness_assessments',
    'compliance_alerts', 'background_reference_documents', 'app_settings', 'countries'
  ] loop
    execute format(
      'drop trigger if exists trg_%I_updated_at on %I;
       create trigger trg_%I_updated_at before update on %I
       for each row execute function public.set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;

-- ============================================================================
-- 17. Storage buckets
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('supplier-documents',   'supplier-documents',   false, 52428800, null),
  ('background-documents', 'background-documents', false, 52428800, null)
on conflict (id) do nothing;

commit;
