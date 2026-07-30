-- ============================================================================
-- 000_diagnose.sql — READ ONLY. Run this first, then send back the output.
--
-- Returns ONE result set. The Supabase SQL editor only shows the last
-- statement's results, so everything is unioned into a single query.
--
-- This database's migration history is partial: migration 037 exists only
-- because 019 "never actually ran against this database", and import_entries
-- was absent despite migration 008 creating it. This survey establishes what is
-- actually present before converging.
--
-- Nothing here modifies anything. The helper function is created in pg_temp and
-- disappears when the session ends.
-- ============================================================================

create or replace function pg_temp.diagnose()
returns table (section text, item text, status text)
language plpgsql
as $fn$
declare
  t      text;
  c      record;
  n      bigint;
  tables text[] := array[
    'importers', 'importer_entry_identities', 'profiles', 'countries',
    'suppliers', 'supplier_relationships', 'facilities_verify',
    'facility_supplier_access', 'products_verify', 'rule_sets', 'rule_versions',
    'approval_thresholds', 'requirement_sections', 'scoring_category_weights',
    'requirement_items', 'fsvp_requirements', 'documents', 'document_categories',
    'requirement_evidence', 'scoring_results', 'fsvp_records',
    'fsvp_record_evidence', 'approval_decisions', 'reassessment_schedules',
    'fsvp_plan_hazard_analyses', 'fsvp_plan_hazard_items',
    'fsvp_verification_records', 'corrective_actions', 'fsvp_reassessments',
    'readiness_assessments', 'readiness_scores', 'generated_reports',
    'app_notifications', 'notification_deliveries', 'compliance_alerts',
    'background_reference_documents', 'audit_logs', 'app_settings',
    'import_entries'
  ];
  legacy text[] := array[
    'foods', 'foreign_suppliers', 'organizations', 'user_roles', 'commodities',
    'qualified_individuals', 'hazard_library', 'reviews', 'document_versions',
    'subscription_entitlements', 'importer_users', 'reminders',
    'supplier_products', 'supplier_facilities', 'importer_supplier_links',
    'exporter_supplier_links', 'readiness_reports', 'commodity_risks',
    'hazard_analyses', 'onboarding_steps', 'record_signatures', 'role_permissions'
  ];
begin

  -- 1. Which baseline tables are missing?
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      return query select '1. MISSING TABLE'::text, t, 'must be created'::text;
    end if;
  end loop;
  if not found then
    return query select '1. MISSING TABLE'::text, '(none)'::text, 'all baseline tables present'::text;
  end if;

  -- 2. Legacy tables still present (the convergence drops these).
  foreach t in array legacy loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      return query select '2. LEGACY TABLE'::text, t, (n || ' rows — will be dropped')::text;
    end if;
  end loop;

  -- 3. Key columns, to show which migrations actually landed.
  for c in
    select * from (values
      ('suppliers','supplier_type'), ('suppliers','portal_status'),
      ('suppliers','duns_number'), ('suppliers','record_mode'),
      ('suppliers','importer_id'), ('suppliers','organization_id'),
      ('documents','evidence_status'), ('documents','supplier_id'),
      ('documents','updated_at'), ('documents','facility_id'),
      ('documents','requirement_item_id'), ('documents','evidence_source'),
      ('products_verify','facility_id'), ('products_verify','commodity_id'),
      ('importers','duns_number'), ('importers','status_history'),
      ('corrective_actions','food_id'), ('corrective_actions','supplier_id'),
      ('generated_reports','export_format'),
      ('profiles','supplier_id'), ('profiles','importer_id')
    ) as v(tbl, col)
  loop
    if to_regclass('public.' || c.tbl) is null then
      return query select '3. COLUMN'::text, (c.tbl || '.' || c.col)::text, 'table missing'::text;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = c.tbl and column_name = c.col
    ) then
      return query select '3. COLUMN'::text, (c.tbl || '.' || c.col)::text, 'present'::text;
    else
      return query select '3. COLUMN'::text, (c.tbl || '.' || c.col)::text, 'ABSENT'::text;
    end if;
  end loop;

  -- 4. Tenancy: how many profiles share each organization?
  if to_regclass('public.importers') is not null and to_regclass('public.profiles') is not null then
    return query
      select '4. TENANCY'::text,
             (i.display_name || ' [' || left(i.id::text, 8) || ']')::text,
             ('importers=' || count(p.id) filter (where p.role::text = 'us_importer')
              || ' reviewers=' || count(p.id) filter (where p.role::text = 'reviewer')
              || ' admins='    || count(p.id) filter (where p.role::text = 'administrator'))::text
      from importers i
      left join profiles p on p.importer_id = i.id
      group by i.id, i.display_name, i.created_at
      order by i.created_at;

    return query
      select '4. TENANCY'::text, 'profiles with NO importer_id'::text, count(*)::text
      from profiles where importer_id is null;
  end if;

  -- 5. Orphan rows the convergence would delete.
  foreach t in array array['corrective_actions', 'readiness_assessments'] loop
    if to_regclass('public.' || t) is not null
       and to_regclass('public.suppliers') is not null then
      execute format(
        'select count(*) from public.%I x
         where not exists (select 1 from public.suppliers s where s.id = x.supplier_id)', t
      ) into n;
      return query select '5. ORPHANS'::text, t, (n || ' rows would be DELETED')::text;
    end if;
  end loop;

  -- 6. Row counts for the tables that matter.
  foreach t in array array[
    'importers', 'profiles', 'suppliers', 'supplier_relationships',
    'facilities_verify', 'products_verify', 'documents', 'fsvp_records',
    'rule_versions', 'requirement_items', 'countries'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      return query select '6. ROW COUNT'::text, t, n::text;
    end if;
  end loop;

  -- 7. Published rule version — the app cannot create an FSVP record without one.
  if to_regclass('public.rule_versions') is not null then
    execute 'select count(*) from rule_versions where status = ''published''' into n;
    return query select '7. RULES'::text, 'published rule versions'::text,
      case when n = 0 then '0 — BLOCKER, run 002_reference_data.sql' else n::text end;
  end if;

  return;
end;
$fn$;

select * from pg_temp.diagnose() order by section, item;
