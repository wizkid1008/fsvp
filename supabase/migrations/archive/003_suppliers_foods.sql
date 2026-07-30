-- 003_suppliers_foods.sql — foreign suppliers, foods, supply chain links, food_effective_path view

-- Foreign suppliers (self-referential for supplier-of-supplier chain)
create table foreign_suppliers (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  parent_supplier_id              uuid references foreign_suppliers(id),
  supplier_name                   text not null,
  legal_name                      text,
  ffr_registration_number         text,
  country                         text not null,
  address_json                    jsonb not null,
  contact_name                    text,
  contact_email                   text,
  contact_phone                   text,
  supplier_classification         text not null default 'standard' check (supplier_classification in
                                    ('standard','qualified_facility','small_produce_farm','small_shell_egg_producer')),
  country_equivalence_id          uuid,   -- FK added in 007
  approval_status                 text not null default 'pending' check (approval_status in
                                    ('pending','approved','temporary','suspended','discontinued')),
  approval_status_history         jsonb not null default '[]'::jsonb,
  temporary_approval_until        timestamptz,
  discontinued_at                 timestamptz,
  notes                           text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index ix_suppliers_importer_status on foreign_suppliers (importer_id, approval_status);

-- A "food" = food × supplier combination (FSVP unit)
create table foods (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete restrict,
  food_name                       text not null,
  description                     text,
  fda_product_code                text,
  harmonized_tariff_code          text,
  intended_use                    text check (intended_use in
                                    ('consumer_ready','further_processing','animal_feed','ingredient','other')),
  current_evaluation_id           uuid,   -- FK added in 004
  current_hazard_analysis_id      uuid,   -- FK added in 004
  active                          boolean not null default true,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index ix_foods_importer_supplier_active on foods (importer_id, supplier_id, active);

-- Derived view: per-food applicable FSVP path
create view food_effective_path as
  select
    f.id as food_id,
    f.importer_id,
    case
      when iep.compliance_path = 'vsi'                              then 'vsi_modified'
      when fs.supplier_classification != 'standard'                 then 'small_supplier_modified'
      when fs.country_equivalence_id is not null                    then 'equivalence_reduced'
      else 'full'
    end as applicable_path
  from foods f
    join foreign_suppliers fs on fs.id = f.supplier_id
    join importer_effective_path iep on iep.importer_id = f.importer_id;

-- Per-food controlling party chain (§ 1.504(c))
create table food_supply_chain_links (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  food_id                         uuid not null references foods(id) on delete cascade,
  controlling_role                text not null check (controlling_role in
                                    ('foreign_supplier','supplier_of_supplier','importer_customer','importer')),
  controlling_supplier_id         uuid references foreign_suppliers(id),
  hazard_scope_text               text,
  effective_from                  timestamptz not null default now(),
  effective_to                    timestamptz,
  created_at                      timestamptz not null default now()
);
create index ix_food_chain_food on food_supply_chain_links (food_id) where effective_to is null;
