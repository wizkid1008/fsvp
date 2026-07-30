-- 018_settings_categories_workflows.sql - admin settings, document categories, and onboarding workflows

create table if not exists app_settings (
  setting_key text primary key,
  label text not null,
  detail text,
  setting_type text not null default 'boolean' check (setting_type in ('boolean', 'text', 'number', 'json')),
  boolean_value boolean,
  text_value text,
  number_value numeric,
  json_value jsonb,
  category text not null default 'workflow',
  sort_order int not null default 0,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_categories (
  id uuid primary key default gen_random_uuid(),
  category_key text not null unique,
  label text not null,
  description text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  role verify_role not null,
  step_key text not null,
  title text not null,
  description text not null,
  cta_label text not null,
  cta_href text not null,
  dashboard_label text,
  dashboard_href text,
  completion_key text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, step_key)
);

alter table app_settings enable row level security;
alter table document_categories enable row level security;
alter table onboarding_steps enable row level security;

drop policy if exists app_settings_authenticated_read on app_settings;
create policy app_settings_authenticated_read on app_settings
  for select to authenticated
  using (true);

drop policy if exists app_settings_admin_write on app_settings;
create policy app_settings_admin_write on app_settings
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists document_categories_authenticated_read on document_categories;
create policy document_categories_authenticated_read on document_categories
  for select to authenticated
  using (active or public.is_platform_admin());

drop policy if exists document_categories_admin_write on document_categories;
create policy document_categories_admin_write on document_categories
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists onboarding_steps_authenticated_read on onboarding_steps;
create policy onboarding_steps_authenticated_read on onboarding_steps
  for select to authenticated
  using (active or public.is_platform_admin());

drop policy if exists onboarding_steps_admin_write on onboarding_steps;
create policy onboarding_steps_admin_write on onboarding_steps
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop trigger if exists trg_app_settings_updated_at on app_settings;
create trigger trg_app_settings_updated_at before update on app_settings
  for each row execute function set_updated_at();

drop trigger if exists trg_document_categories_updated_at on document_categories;
create trigger trg_document_categories_updated_at before update on document_categories
  for each row execute function set_updated_at();

drop trigger if exists trg_onboarding_steps_updated_at on onboarding_steps;
create trigger trg_onboarding_steps_updated_at before update on onboarding_steps
  for each row execute function set_updated_at();

insert into app_settings (setting_key, label, detail, setting_type, boolean_value, category, sort_order)
values
  ('require_email_verification', 'Require email verification', 'Block protected access until Supabase email confirmation completes.', 'boolean', true, 'workflow', 10),
  ('escalate_critical_gaps', 'Escalate critical gaps', 'Notify administrators when critical evidence gaps remain open after 7 days.', 'boolean', true, 'workflow', 20),
  ('allow_supplier_self_upload', 'Allow supplier self-upload', 'Suppliers can upload documents into assigned requirement queues.', 'boolean', true, 'workflow', 30),
  ('auto_generate_audit_events', 'Auto-generate audit events', 'Log role changes, document reviews, report exports, and corrective action updates.', 'boolean', true, 'workflow', 40)
on conflict (setting_key) do update
set
  label = excluded.label,
  detail = excluded.detail,
  setting_type = excluded.setting_type,
  category = excluded.category,
  sort_order = excluded.sort_order;

insert into document_categories (category_key, label, sort_order)
values
  ('food_safety_plan', 'Food Safety Plan', 10),
  ('haccp_plan', 'HACCP Plan', 20),
  ('certificate_of_analysis', 'Certificate of Analysis', 30),
  ('audit_report', 'Audit Report', 40),
  ('gmp_certification', 'GMP Certification', 50),
  ('fda_registration', 'FDA Registration', 60),
  ('recall_record', 'Recall Record', 70),
  ('traceability_record', 'Traceability Record', 80),
  ('supplier_questionnaire', 'Supplier Questionnaire', 90),
  ('product_specification', 'Product Specification', 100),
  ('allergen_control_program', 'Allergen Control Program', 110),
  ('environmental_monitoring', 'Environmental Monitoring', 120),
  ('corrective_action_report', 'Corrective Action Report', 130),
  ('laboratory_testing_report', 'Laboratory Testing Report', 140),
  ('training_record', 'Training Record', 150),
  ('other', 'Other', 160)
on conflict (category_key) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order;

insert into onboarding_steps (
  role, step_key, title, description, cta_label, cta_href, dashboard_label, dashboard_href, completion_key, sort_order
)
values
  ('us_importer', 'profile', 'Complete your profile', 'Add your name, organization, and contact details.', 'Go to Account', '/account', 'Complete your profile', '/account', 'profile', 10),
  ('us_importer', 'supplier', 'Add your first supplier', 'Create a supplier record with company name, country, and contact information.', 'Add Supplier', '/suppliers', 'Add a supplier', '/suppliers', 'supplier', 20),
  ('us_importer', 'product', 'Add products and facilities', 'Link the food products your supplier exports and the facilities where they are produced.', 'Add Products', '/products', 'Add a product or facility', '/products', 'product', 30),
  ('us_importer', 'evidence', 'Upload FSVP evidence', 'Upload COAs, audit reports, hazard analyses, and other required documents.', 'Upload Evidence', '/evidence', 'Upload evidence', '/evidence', 'evidence', 40),
  ('us_importer', 'readiness', 'Run a readiness assessment', 'Calculate your readiness score, identify gaps, and generate audit-ready reports.', 'Start Assessment', '/readiness', 'Run readiness assessment', '/readiness', 'readiness', 50),
  ('foreign_supplier', 'profile', 'Complete your profile', 'Add your company name, contact details, and country so your importer can identify you.', 'Go to Account', '/account', 'Complete your profile', '/account', 'profile', 10),
  ('foreign_supplier', 'evidence', 'Upload your evidence', 'Upload the documents your importer has requested, including COAs, certifications, and food safety plans.', 'Upload Evidence', '/my-evidence', 'Upload your evidence', '/my-evidence', 'evidence', 20),
  ('foreign_supplier', 'readiness', 'Review your action items', 'Check for corrective actions, revision requests, or additional documents your importer has requested.', 'View Action Items', '/my-requests', 'Review action items', '/my-requests', 'readiness', 30)
on conflict (role, step_key) do update
set
  title = excluded.title,
  description = excluded.description,
  cta_label = excluded.cta_label,
  cta_href = excluded.cta_href,
  dashboard_label = excluded.dashboard_label,
  dashboard_href = excluded.dashboard_href,
  completion_key = excluded.completion_key,
  sort_order = excluded.sort_order;
