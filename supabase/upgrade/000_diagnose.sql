-- ============================================================================
-- 000_diagnose.sql — READ ONLY. Run this first.
--
-- This database's migration history is partial: migration 037 exists only
-- because 019 "never actually ran against this database", and import_entries
-- was absent despite migration 008 creating it. So before converging, find out
-- what is actually there.
--
-- Nothing here modifies anything. Run it and send back the output.
-- ============================================================================

-- 1. Which baseline tables exist, and which are missing?
select
  t.name as table_name,
  case when to_regclass('public.' || t.name) is null then 'MISSING' else 'present' end as status
from (values
  ('importers'), ('importer_entry_identities'), ('profiles'), ('countries'),
  ('suppliers'), ('supplier_relationships'), ('facilities_verify'),
  ('facility_supplier_access'), ('products_verify'), ('rule_sets'), ('rule_versions'),
  ('approval_thresholds'), ('requirement_sections'), ('scoring_category_weights'),
  ('requirement_items'), ('fsvp_requirements'), ('documents'), ('document_categories'),
  ('requirement_evidence'), ('scoring_results'), ('fsvp_records'),
  ('fsvp_record_evidence'), ('approval_decisions'), ('reassessment_schedules'),
  ('fsvp_plan_hazard_analyses'), ('fsvp_plan_hazard_items'),
  ('fsvp_verification_records'), ('corrective_actions'), ('fsvp_reassessments'),
  ('readiness_assessments'), ('readiness_scores'), ('generated_reports'),
  ('app_notifications'), ('notification_deliveries'), ('compliance_alerts'),
  ('background_reference_documents'), ('audit_logs'), ('app_settings'),
  ('import_entries')
) as t(name)
order by status, table_name;

-- 2. Legacy tables still present that the convergence will drop.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'foods', 'foreign_suppliers', 'organizations', 'user_roles', 'commodities',
    'qualified_individuals', 'hazard_library', 'reviews', 'document_versions',
    'subscription_entitlements', 'importer_users', 'reminders', 'supplier_products',
    'supplier_facilities', 'importer_supplier_links', 'exporter_supplier_links',
    'readiness_reports', 'commodity_risks', 'hazard_analyses', 'onboarding_steps'
  )
order by table_name;

-- 3. Key columns the app expects — confirms which migrations actually landed.
select
  c.tbl || '.' || c.col as column_name,
  case when exists (
    select 1 from information_schema.columns ic
    where ic.table_schema = 'public' and ic.table_name = c.tbl and ic.column_name = c.col
  ) then 'present' else 'MISSING' end as status
from (values
  ('suppliers', 'supplier_type'), ('suppliers', 'portal_status'), ('suppliers', 'duns_number'),
  ('suppliers', 'record_mode'), ('suppliers', 'importer_id'),
  ('documents', 'evidence_status'), ('documents', 'supplier_id'), ('documents', 'updated_at'),
  ('documents', 'facility_id'), ('documents', 'requirement_item_id'),
  ('products_verify', 'facility_id'), ('products_verify', 'commodity_id'),
  ('importers', 'duns_number'), ('importers', 'status_history'),
  ('corrective_actions', 'food_id'), ('generated_reports', 'export_format'),
  ('profiles', 'supplier_id'), ('profiles', 'importer_id')
) as c(tbl, col)
order by status, column_name;

-- 4. Tenancy reality check — how many importer profiles share an organization?
select
  i.id as importer_id,
  i.display_name,
  count(p.id) filter (where p.role::text = 'us_importer')   as importer_profiles,
  count(p.id) filter (where p.role::text = 'reviewer')      as reviewer_profiles,
  count(p.id) filter (where p.role::text = 'administrator') as admin_profiles
from importers i
left join profiles p on p.importer_id = i.id
group by i.id, i.display_name, i.created_at
order by i.created_at;

-- 5. Rows the convergence would delete (orphans left by migration 034).
select 'corrective_actions' as tbl, count(*) as orphan_rows
from corrective_actions c
where not exists (select 1 from suppliers s where s.id = c.supplier_id)
union all
select 'readiness_assessments', count(*)
from readiness_assessments r
where not exists (select 1 from suppliers s where s.id = r.supplier_id);

-- 6. Which triggers and functions are live?
select tgname as trigger_name, relname as on_table
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and relname in ('profiles', 'documents', 'fsvp_records', 'suppliers')
order by relname, tgname;
