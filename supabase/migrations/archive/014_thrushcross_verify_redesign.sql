-- 014_thrushcross_verify_redesign.sql - ThrushCross Verify risk-first FSVP platform model

do $$
begin
  if not exists (select 1 from pg_type where typname = 'verify_role') then
    create type verify_role as enum ('foreign_supplier', 'us_importer', 'reviewer', 'administrator');
  end if;
  if not exists (select 1 from pg_type where typname = 'evidence_status') then
    create type evidence_status as enum (
      'not_started', 'missing', 'uploaded', 'under_review', 'accepted',
      'rejected', 'revision_required', 'complete'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'readiness_status') then
    create type readiness_status as enum (
      'not_ready', 'needs_major_revision', 'needs_minor_revision',
      'ready_for_importer_review', 'approved_for_internal_use'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'risk_level') then
    create type risk_level as enum ('low', 'medium', 'high', 'critical');
  end if;
end $$;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  organization_type text not null check (organization_type in ('foreign_supplier', 'us_importer', 'consultant', 'administrator')),
  country text,
  website text,
  status text not null default 'active' check (status in ('active', 'pending_review', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  importer_id uuid references importers(id) on delete cascade,
  role verify_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (profile_id, organization_id, role)
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  importer_id uuid references importers(id) on delete cascade,
  foreign_supplier_id uuid references foreign_suppliers(id) on delete set null,
  company_name text not null,
  legal_entity_name text,
  registration_number text,
  country text not null,
  address_json jsonb not null default '{}'::jsonb,
  website text,
  contact_json jsonb not null default '{}'::jsonb,
  export_markets text[],
  product_categories text[],
  fda_registration_number text,
  certification_status text not null default 'pending_review'
    check (certification_status in ('active', 'pending_review', 'approved', 'rejected', 'suspended')),
  approval_status text not null default 'pending_review'
    check (approval_status in ('active', 'pending_review', 'approved', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commodities (
  id uuid primary key default gen_random_uuid(),
  commodity_name text not null unique,
  commodity_group text,
  human_food boolean not null default true,
  animal_feed boolean not null default false,
  default_risk_level risk_level not null default 'medium',
  likely_biological_hazards text[],
  likely_chemical_hazards text[],
  likely_physical_hazards text[],
  allergen_risk text,
  recommended_evidence text[],
  created_at timestamptz not null default now()
);

create table if not exists products_verify (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  commodity_id uuid references commodities(id) on delete set null,
  product_name text not null,
  product_description text,
  country_of_origin text,
  raw_or_processed text check (raw_or_processed in ('raw', 'processed', 'both')),
  intended_use text check (intended_use in ('ready_to_eat', 'further_processed', 'animal_feed', 'ingredient', 'other')),
  ingredient_list text,
  product_specifications text,
  shelf_life text,
  packaging_information text,
  allergen_information text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists facilities_verify (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  facility_name text not null,
  facility_address_json jsonb not null default '{}'::jsonb,
  facility_type text not null,
  fda_registration_number text,
  production_capacity text,
  manufacturing_processes text,
  food_safety_certifications text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commodity_risks (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  product_id uuid references products_verify(id) on delete cascade,
  commodity_id uuid references commodities(id) on delete set null,
  country_of_origin text,
  raw_or_processed text,
  human_food_or_animal_feed text check (human_food_or_animal_feed in ('human_food', 'animal_feed', 'both')),
  ready_to_eat_or_further_processed text,
  biological_hazards text[],
  chemical_hazards text[],
  physical_hazards text[],
  allergen_risk text,
  supplier_certification_status text,
  recall_history_summary text,
  risk_level risk_level not null,
  risk_rationale text not null,
  required_verification_evidence text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fsvp_requirements (
  id uuid primary key default gen_random_uuid(),
  requirement_key text not null unique,
  requirement_name text not null,
  requirement_description text not null,
  cfr_citation text,
  required_evidence text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists requirement_evidence (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  product_id uuid references products_verify(id) on delete cascade,
  facility_id uuid references facilities_verify(id) on delete set null,
  requirement_id uuid not null references fsvp_requirements(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  document_version_id uuid references document_versions(id) on delete set null,
  reviewer_profile_id uuid references profiles(id) on delete set null,
  status evidence_status not null default 'not_started',
  reviewer_notes text,
  gap_status text,
  corrective_action_id uuid references corrective_actions(id) on delete set null,
  final_determination text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  product_id uuid references products_verify(id) on delete set null,
  reviewer_profile_id uuid references profiles(id) on delete set null,
  review_type text not null check (review_type in ('document', 'requirement', 'supplier', 'readiness_report')),
  status evidence_status not null default 'under_review',
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists readiness_reports (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  product_id uuid references products_verify(id) on delete set null,
  facility_id uuid references facilities_verify(id) on delete set null,
  commodity_risk_id uuid references commodity_risks(id) on delete set null,
  overall_score numeric(5,2) not null,
  readiness_status readiness_status not null,
  supplier_profile_summary text,
  product_profile_summary text,
  facility_profile_summary text,
  commodity_risk_summary text,
  hazard_analysis_summary text,
  documents_reviewed_json jsonb not null default '[]'::jsonb,
  requirement_mapping_json jsonb not null default '[]'::jsonb,
  reviewer_comments text,
  open_gaps text,
  corrective_actions_summary text,
  disclaimer text not null default 'This platform does not provide legal or regulatory advice. FSVP determinations should be reviewed by qualified regulatory professionals and/or a qualified FSVP Individual.',
  export_pdf_document_id uuid references documents(id) on delete set null,
  export_excel_document_id uuid references documents(id) on delete set null,
  approved_by_profile_id uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table readiness_scores add column if not exists weight_points numeric(5,2);
alter table readiness_scores add column if not exists critical_gap text;
alter table readiness_scores add column if not exists recommended_next_action text;
alter table documents add column if not exists related_requirement_id uuid references fsvp_requirements(id) on delete set null;
alter table documents add column if not exists expiration_date date;
alter table documents add column if not exists approval_status evidence_status default 'uploaded';
alter table documents add column if not exists reviewer_profile_id uuid references profiles(id) on delete set null;
alter table documents add column if not exists review_notes text;

insert into commodities (
  commodity_name, commodity_group, default_risk_level, likely_biological_hazards,
  likely_chemical_hazards, likely_physical_hazards, allergen_risk, recommended_evidence
) values
  ('Coffee', 'Beverage commodity', 'medium', array['Mold contamination'], array['Ochratoxin A','Pesticide residues'], array['Foreign material'], 'Low', array['COA','Supplier questionnaire','Traceability record']),
  ('Cocoa', 'Ingredient', 'high', array['Salmonella'], array['Heavy metals','Pesticide residues'], array['Foreign material'], 'Low', array['Hazard analysis','COA','Supplier audit']),
  ('Spices', 'Ingredient', 'high', array['Salmonella'], array['Adulterants','Pesticide residues'], array['Foreign material'], 'Variable', array['Kill-step validation','COA','Supplier audit']),
  ('Peanuts', 'Nut commodity', 'critical', array['Salmonella'], array['Aflatoxin'], array['Foreign material'], 'High', array['Aflatoxin testing','Allergen program','Recall history']),
  ('Tree nuts', 'Nut commodity', 'high', array['Salmonella'], array['Aflatoxin'], array['Shell fragments'], 'High', array['Allergen control program','COA','Traceability records']),
  ('Grains', 'Bulk commodity', 'medium', array['Mold contamination'], array['Mycotoxins','Pesticide residues'], array['Foreign material'], 'Variable', array['Mycotoxin testing','Storage controls','COA']),
  ('Oils', 'Processed commodity', 'medium', array[]::text[], array['Chemical contaminants','Adulteration'], array['Foreign material'], 'Variable', array['Product specification','COA','Process controls']),
  ('Fresh produce', 'Produce', 'high', array['Pathogens'], array['Pesticide residues'], array['Foreign material'], 'Low', array['Audit report','Water testing','Recall procedure']),
  ('Dried fruit', 'Produce ingredient', 'high', array['Mold contamination'], array['Sulfites','Mycotoxins'], array['Foreign material'], 'Sulfite risk', array['COA','Sulfite declaration','Mock recall report']),
  ('Seafood', 'Animal protein', 'critical', array['Pathogens'], array['Histamine'], array['Foreign material'], 'Fish/shellfish allergen', array['HACCP plan','Temperature records','Traceability records'])
on conflict (commodity_name) do nothing;

insert into fsvp_requirements (requirement_key, requirement_name, requirement_description, cfr_citation, required_evidence, sort_order)
values
  ('supplier_identity', 'Supplier identity and contact', 'Document foreign supplier identity, contact information, registration, and relationship to importer.', '21 CFR 1.502-1.509', 'Supplier questionnaire, registration details, ownership/contact attestation', 10),
  ('product_identity', 'Product and commodity identity', 'Document the food, commodity, intended use, origin, specifications, allergens, and processing state.', '21 CFR 1.504', 'Product specification, ingredient/allergen statement, intended use record', 20),
  ('facility_information', 'Facility information', 'Document facility location, processes, FDA registration, capacity, and safety certifications.', '21 CFR 1.504-1.506', 'Facility profile, FDA registration, process flow, certifications', 30),
  ('hazard_analysis', 'Commodity hazard analysis', 'Identify known or reasonably foreseeable biological, chemical, and physical hazards.', '21 CFR 1.504', 'Hazard analysis and qualified individual review', 40),
  ('verification_activities', 'Verification activities', 'Determine appropriate supplier verification activities based on hazard and supplier risk.', '21 CFR 1.506', 'Audit, sampling/testing, COA, records review, verification rationale', 50),
  ('food_safety_controls', 'Food safety controls', 'Document preventive controls, process controls, CCPs, corrective actions, and monitoring evidence.', '21 CFR 1.506', 'Food safety plan, HACCP/HARPC plan, monitoring records', 60),
  ('testing_coa', 'Testing and COAs', 'Maintain testing evidence and certificates of analysis appropriate to the commodity risk.', '21 CFR 1.506', 'COA, lab testing report, sampling plan', 70),
  ('traceability_recall', 'Traceability and recall', 'Document lot traceability, recall procedures, and mock recall performance.', '21 CFR 1.508-1.510', 'Traceability records, recall procedure, mock recall report', 80),
  ('corrective_actions', 'Corrective actions', 'Document corrective actions taken when verification evidence or supplier performance is inadequate.', '21 CFR 1.508', 'Corrective action record and closure evidence', 90)
on conflict (requirement_key) do nothing;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','user_roles','suppliers','commodities','products_verify','facilities_verify',
    'commodity_risks','fsvp_requirements','requirement_evidence','reviews','readiness_reports'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

drop policy if exists organizations_user_read on organizations;
create policy organizations_user_read on organizations
  for select to authenticated
  using (
    public.is_platform_admin()
    or id in (select organization_id from user_roles where profile_id = auth.uid() and active)
  );

drop policy if exists organizations_admin_write on organizations;
create policy organizations_admin_write on organizations
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists user_roles_self_read on user_roles;
create policy user_roles_self_read on user_roles
  for select to authenticated
  using (public.is_platform_admin() or profile_id = auth.uid());

drop policy if exists user_roles_admin_write on user_roles;
create policy user_roles_admin_write on user_roles
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists fsvp_requirements_read on fsvp_requirements;
create policy fsvp_requirements_read on fsvp_requirements
  for select to authenticated
  using (active);

drop policy if exists fsvp_requirements_admin_write on fsvp_requirements;
create policy fsvp_requirements_admin_write on fsvp_requirements
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists commodities_read on commodities;
create policy commodities_read on commodities
  for select to authenticated
  using (true);

drop policy if exists commodities_admin_write on commodities;
create policy commodities_admin_write on commodities
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'suppliers','products_verify','facilities_verify','commodity_risks',
    'requirement_evidence','reviews','readiness_reports'
  ] loop
    execute format(
      'drop policy if exists %I_tenant_read on %I;
       create policy %I_tenant_read on %I for select to authenticated
       using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));',
      t, t, t, t
    );
    execute format(
      'drop policy if exists %I_tenant_write on %I;
       create policy %I_tenant_write on %I for all to authenticated
       using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
       with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));',
      t, t, t, t
    );
  end loop;
end $$;

drop policy if exists suppliers_org_write on suppliers;
create policy suppliers_org_write on suppliers
  for all to authenticated
  using (
    public.is_platform_admin()
    or organization_id in (
      select organization_id from user_roles
      where profile_id = auth.uid()
        and role = 'foreign_supplier'
        and active
    )
  )
  with check (
    public.is_platform_admin()
    or organization_id in (
      select organization_id from user_roles
      where profile_id = auth.uid()
        and role = 'foreign_supplier'
        and active
    )
  );

drop policy if exists products_supplier_org_write on products_verify;
create policy products_supplier_org_write on products_verify
  for all to authenticated
  using (
    public.is_platform_admin()
    or supplier_id in (
      select s.id from suppliers s
      join user_roles ur on ur.organization_id = s.organization_id
      where ur.profile_id = auth.uid()
        and ur.role = 'foreign_supplier'
        and ur.active
    )
  )
  with check (
    public.is_platform_admin()
    or supplier_id in (
      select s.id from suppliers s
      join user_roles ur on ur.organization_id = s.organization_id
      where ur.profile_id = auth.uid()
        and ur.role = 'foreign_supplier'
        and ur.active
    )
  );

drop policy if exists facilities_supplier_org_write on facilities_verify;
create policy facilities_supplier_org_write on facilities_verify
  for all to authenticated
  using (
    public.is_platform_admin()
    or supplier_id in (
      select s.id from suppliers s
      join user_roles ur on ur.organization_id = s.organization_id
      where ur.profile_id = auth.uid()
        and ur.role = 'foreign_supplier'
        and ur.active
    )
  )
  with check (
    public.is_platform_admin()
    or supplier_id in (
      select s.id from suppliers s
      join user_roles ur on ur.organization_id = s.organization_id
      where ur.profile_id = auth.uid()
        and ur.role = 'foreign_supplier'
        and ur.active
    )
  );

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','suppliers','products_verify','facilities_verify',
    'commodity_risks','requirement_evidence','readiness_reports'
  ] loop
    execute format(
      'drop trigger if exists trg_%I_updated_at on %I;
       create trigger trg_%I_updated_at before update on %I
       for each row execute function set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;
