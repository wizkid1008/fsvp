-- 021_rules_engine_schema_extensions.sql
-- Adds: rules engine tables, importer_supplier_links, extended columns on
-- suppliers / facilities_verify / products_verify / documents / audit_logs.
-- Suppliers become shared (global) entities; importers relate via junction table.

-- ============================================================
-- 1. Extend app_role enum with us_importer if not present
--    (migration 016 adds it as a check constraint; ensure enum parity)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'us_importer'
      and enumtypid = (select oid from pg_type where typname = 'app_role')
  ) then
    alter type app_role add value 'us_importer';
  end if;
end $$;

-- ============================================================
-- 2. Rules engine — global tables (no importer_id)
-- ============================================================

create table if not exists rule_sets (
  id                     uuid primary key default gen_random_uuid(),
  set_name               text not null,
  description            text,
  applies_to             text not null check (applies_to in ('facility', 'product', 'fsvp_record', 'all')),
  created_by_profile_id  uuid references profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists rule_versions (
  id                      uuid primary key default gen_random_uuid(),
  rule_set_id             uuid not null references rule_sets(id) on delete cascade,
  version_number          int not null,
  status                  text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  published_at            timestamptz,
  archived_at             timestamptz,
  cloned_from_version_id  uuid references rule_versions(id) on delete set null,
  notes                   text,
  created_by_profile_id   uuid references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (rule_set_id, version_number)
);

create table if not exists approval_thresholds (
  id               uuid primary key default gen_random_uuid(),
  rule_version_id  uuid not null references rule_versions(id) on delete cascade,
  label            text not null,
  min_score        numeric(5,2) not null,
  max_score        numeric(5,2) not null,
  resulting_status text not null,
  created_at       timestamptz not null default now(),
  unique (rule_version_id, label)
);

create table if not exists requirement_sections (
  id               uuid primary key default gen_random_uuid(),
  rule_version_id  uuid not null references rule_versions(id) on delete cascade,
  section_key      text not null,
  section_name     text not null,
  applies_to       text not null check (applies_to in ('facility', 'product', 'supplier')),
  description      text,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  unique (rule_version_id, section_key)
);

create table if not exists scoring_category_weights (
  id               uuid primary key default gen_random_uuid(),
  rule_version_id  uuid not null references rule_versions(id) on delete cascade,
  section_id       uuid not null references requirement_sections(id) on delete cascade,
  weight_percent   numeric(5,2) not null check (weight_percent > 0 and weight_percent <= 100),
  created_at       timestamptz not null default now(),
  unique (rule_version_id, section_id)
);

create table if not exists requirement_items (
  id                   uuid primary key default gen_random_uuid(),
  section_id           uuid not null references requirement_sections(id) on delete cascade,
  item_key             text not null,
  item_name            text not null,
  description          text,
  evidence_type        text,
  is_required          boolean not null default true,
  is_critical_blocker  boolean not null default false,
  auto_accept          boolean not null default false,
  expiration_applies   boolean not null default false,
  cfr_citation         text,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now(),
  unique (section_id, item_key)
);

-- ============================================================
-- 3. Validation: scoring weights must not exceed 100% per
--    rule_version + applies_to combination
-- ============================================================
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

drop trigger if exists trg_validate_scoring_weights on scoring_category_weights;
create trigger trg_validate_scoring_weights
  before insert or update of weight_percent
  on scoring_category_weights
  for each row execute function public.validate_scoring_weights();

-- ============================================================
-- 4. Guard: published rule versions cannot be edited
-- ============================================================
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
       when 'requirement_sections'      then old.rule_version_id
       when 'scoring_category_weights'  then old.rule_version_id
       when 'requirement_items'         then (select rule_version_id from requirement_sections where id = old.section_id)
     end),
    (case TG_TABLE_NAME
       when 'requirement_sections'      then new.rule_version_id
       when 'scoring_category_weights'  then new.rule_version_id
       when 'requirement_items'         then (select rule_version_id from requirement_sections where id = new.section_id)
     end)
  );

  if exists (
    select 1 from rule_versions
    where id = v_rule_version_id and status = 'published'
  ) then
    raise exception 'Published rule versions cannot be edited. Clone into a new draft first.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_requirement_sections_published_guard on requirement_sections;
create trigger trg_requirement_sections_published_guard
  before update on requirement_sections
  for each row execute function public.prevent_published_rule_edit();

drop trigger if exists trg_scoring_weights_published_guard on scoring_category_weights;
create trigger trg_scoring_weights_published_guard
  before update on scoring_category_weights
  for each row execute function public.prevent_published_rule_edit();

drop trigger if exists trg_requirement_items_published_guard on requirement_items;
create trigger trg_requirement_items_published_guard
  before update on requirement_items
  for each row execute function public.prevent_published_rule_edit();

-- ============================================================
-- 5. Make suppliers a shared entity (remove NOT NULL on importer_id)
-- ============================================================
alter table suppliers
  alter column importer_id drop not null;

alter table suppliers
  add column if not exists portal_status   text not null default 'active'
    check (portal_status in ('active', 'pending', 'suspended')),
  add column if not exists readiness_score numeric(5,2),
  add column if not exists last_reviewed_at    timestamptz,
  add column if not exists rule_version_id     uuid references rule_versions(id) on delete set null;

-- Junction: which importers are linked to which suppliers
create table if not exists importer_supplier_links (
  id                    uuid primary key default gen_random_uuid(),
  importer_id           uuid not null references importers(id) on delete cascade,
  supplier_id           uuid not null references suppliers(id) on delete cascade,
  relationship_status   text not null default 'active'
    check (relationship_status in ('active', 'paused', 'terminated')),
  linked_at             timestamptz not null default now(),
  linked_by_profile_id  uuid references profiles(id) on delete set null,
  unique (importer_id, supplier_id)
);

-- Back-fill existing supplier–importer rows into the link table
insert into importer_supplier_links (importer_id, supplier_id)
select importer_id, id
from suppliers
where importer_id is not null
on conflict (importer_id, supplier_id) do nothing;

-- ============================================================
-- 6. Extend facilities_verify
-- ============================================================
alter table facilities_verify
  add column if not exists readiness_score          numeric(5,2),
  add column if not exists approval_status          text not null default 'pending'
    check (approval_status in (
      'pending', 'approved', 'conditionally_approved',
      'improvement_required', 'not_approved', 'suspended'
    )),
  add column if not exists rule_version_id          uuid references rule_versions(id) on delete set null,
  add column if not exists last_reviewed_at         timestamptz,
  add column if not exists reviewed_by_profile_id   uuid references profiles(id) on delete set null;

-- ============================================================
-- 7. Extend products_verify
-- ============================================================
alter table products_verify
  add column if not exists readiness_score          numeric(5,2),
  add column if not exists approval_status          text not null default 'pending'
    check (approval_status in (
      'pending', 'approved', 'conditionally_approved',
      'improvement_required', 'not_approved'
    )),
  add column if not exists rule_version_id          uuid references rule_versions(id) on delete set null,
  add column if not exists last_reviewed_at         timestamptz,
  add column if not exists reviewed_by_profile_id   uuid references profiles(id) on delete set null;

-- ============================================================
-- 8. Extend documents with evidence workflow columns
-- ============================================================
alter table documents
  add column if not exists evidence_status       text not null default 'not_submitted'
    check (evidence_status in (
      'not_submitted', 'submitted', 'under_review', 'accepted',
      'needs_revision', 'rejected', 'expired'
    )),
  add column if not exists rule_version_id       uuid references rule_versions(id) on delete set null,
  add column if not exists requirement_item_id   uuid references requirement_items(id) on delete set null,
  add column if not exists facility_id           uuid references facilities_verify(id) on delete set null,
  add column if not exists expiration_date       date,
  add column if not exists uploaded_by_profile_id uuid references profiles(id) on delete set null;

-- ============================================================
-- 9. Extend audit_logs with actor_role
-- ============================================================
alter table audit_logs
  add column if not exists actor_role text;

-- ============================================================
-- 10. RLS for new tables
-- ============================================================
alter table rule_sets                 enable row level security;
alter table rule_versions             enable row level security;
alter table approval_thresholds       enable row level security;
alter table requirement_sections      enable row level security;
alter table scoring_category_weights  enable row level security;
alter table requirement_items         enable row level security;
alter table importer_supplier_links   enable row level security;

-- Rules: all authenticated users can read; only admins write
create policy rule_sets_read on rule_sets
  for select to authenticated using (true);
create policy rule_sets_admin_write on rule_sets
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy rule_versions_read on rule_versions
  for select to authenticated using (true);
create policy rule_versions_admin_write on rule_versions
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy approval_thresholds_read on approval_thresholds
  for select to authenticated using (true);
create policy approval_thresholds_admin_write on approval_thresholds
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy requirement_sections_read on requirement_sections
  for select to authenticated using (true);
create policy requirement_sections_admin_write on requirement_sections
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy scoring_weights_read on scoring_category_weights
  for select to authenticated using (true);
create policy scoring_weights_admin_write on scoring_category_weights
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy requirement_items_read on requirement_items
  for select to authenticated using (true);
create policy requirement_items_admin_write on requirement_items
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Importer-supplier links: each importer sees only their own links
create policy importer_supplier_links_read on importer_supplier_links
  for select to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (select supplier_id from profiles where id = auth.uid() and supplier_id is not null)
  );
create policy importer_supplier_links_write on importer_supplier_links
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
  );

-- Suppliers: shared — importers/reviewers/admins can read all;
-- supplier users can read/update their own record; importers can create/update
drop policy if exists suppliers_tenant_read  on suppliers;
drop policy if exists suppliers_tenant_write on suppliers;
create policy suppliers_read on suppliers
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and role::text in ('us_importer', 'reviewer', 'administrator')
    )
    or id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );
create policy suppliers_write on suppliers
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

-- ============================================================
-- 11. updated_at triggers for new tables
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['rule_sets', 'rule_versions', 'importer_supplier_links'] loop
    execute format(
      'drop trigger if exists trg_%I_updated_at on %I;
       create trigger trg_%I_updated_at before update on %I
       for each row execute function set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;

-- ============================================================
-- 12. Seed: default rule set, published version 1, spec weights
-- ============================================================
do $$
declare
  v_ruleset_id  uuid;
  v_version_id  uuid;
  v_section_id  uuid;
  v_section_key text;
begin
  insert into rule_sets (set_name, description, applies_to)
  values (
    'FSVP Standard',
    'Default FSVP compliance rule set based on 21 CFR Part 1 Subpart L',
    'all'
  )
  on conflict do nothing
  returning id into v_ruleset_id;

  if v_ruleset_id is null then
    select id into v_ruleset_id from rule_sets where set_name = 'FSVP Standard' limit 1;
  end if;

  insert into rule_versions (rule_set_id, version_number, status, published_at, notes)
  values (
    v_ruleset_id, 1, 'published', now(),
    'Initial published version — scoring weights per FSVP platform specification'
  )
  on conflict (rule_set_id, version_number) do nothing
  returning id into v_version_id;

  if v_version_id is null then
    select id into v_version_id
    from rule_versions
    where rule_set_id = v_ruleset_id and version_number = 1 limit 1;
  end if;

  -- Approval thresholds
  insert into approval_thresholds (rule_version_id, label, min_score, max_score, resulting_status)
  values
    (v_version_id, 'Approved',               90, 100, 'importer_approved'),
    (v_version_id, 'Conditionally Approved',  75,  89, 'conditionally_approved'),
    (v_version_id, 'Improvement Required',    60,  74, 'needs_corrective_action'),
    (v_version_id, 'Not Approved',             0,  59, 'rejected')
  on conflict (rule_version_id, label) do nothing;

  -- Facility sections
  insert into requirement_sections (rule_version_id, section_key, section_name, applies_to, sort_order)
  values
    (v_version_id, 'facility_registration',  'Facility Registration & Legal Compliance', 'facility', 10),
    (v_version_id, 'food_safety_mgmt',        'Food Safety Management System',            'facility', 20),
    (v_version_id, 'gmp_sanitation',          'GMP and Sanitation Programs',              'facility', 30),
    (v_version_id, 'haccp_preventive',        'HACCP / Preventive Controls',              'facility', 40),
    (v_version_id, 'traceability_recall',     'Traceability and Recall Program',          'facility', 50),
    (v_version_id, 'testing_lab',             'Testing / Lab Controls',                   'facility', 60),
    (v_version_id, 'audit_history',           'Audit History',                            'facility', 70),
    (v_version_id, 'corrective_action_mgmt',  'Corrective Action Management',             'facility', 80)
  on conflict (rule_version_id, section_key) do nothing;

  -- Facility weights
  for v_section_id, v_section_key in
    select s.id, s.section_key
    from requirement_sections s
    where s.rule_version_id = v_version_id and s.applies_to = 'facility'
  loop
    insert into scoring_category_weights (rule_version_id, section_id, weight_percent)
    values (
      v_version_id,
      v_section_id,
      case v_section_key
        when 'facility_registration'  then 10
        when 'food_safety_mgmt'       then 20
        when 'gmp_sanitation'         then 15
        when 'haccp_preventive'       then 20
        when 'traceability_recall'    then 10
        when 'testing_lab'            then 10
        when 'audit_history'          then 10
        when 'corrective_action_mgmt' then  5
        else 0
      end
    )
    on conflict (rule_version_id, section_id) do nothing;
  end loop;

  -- Product sections
  insert into requirement_sections (rule_version_id, section_key, section_name, applies_to, sort_order)
  values
    (v_version_id, 'product_hazard_analysis', 'Product Hazard Analysis',        'product', 10),
    (v_version_id, 'product_testing',         'Product Testing Program',        'product', 20),
    (v_version_id, 'product_specifications',  'Product Specifications',         'product', 30),
    (v_version_id, 'coa_program',             'COA Program',                    'product', 40),
    (v_version_id, 'labeling_allergen',       'Labeling / Allergen Compliance', 'product', 50),
    (v_version_id, 'nonconformances',         'Historical Non-Conformances',    'product', 60)
  on conflict (rule_version_id, section_key) do nothing;

  -- Product weights
  for v_section_id, v_section_key in
    select s.id, s.section_key
    from requirement_sections s
    where s.rule_version_id = v_version_id and s.applies_to = 'product'
  loop
    insert into scoring_category_weights (rule_version_id, section_id, weight_percent)
    values (
      v_version_id,
      v_section_id,
      case v_section_key
        when 'product_hazard_analysis' then 30
        when 'product_testing'         then 20
        when 'product_specifications'  then 15
        when 'coa_program'             then 15
        when 'labeling_allergen'       then 10
        when 'nonconformances'         then 10
        else 0
      end
    )
    on conflict (rule_version_id, section_id) do nothing;
  end loop;

end $$;
