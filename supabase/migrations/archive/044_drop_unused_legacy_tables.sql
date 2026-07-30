-- 044_drop_unused_legacy_tables.sql
--
-- NOT RUN AUTOMATICALLY. This migration was drafted for review, not executed.
-- Read the whole file, run the preflight query at the bottom of this comment
-- block against production first, and only then apply it yourself.
--
-- Background: migrations 001-013 modeled a broader FSVP/food-safety domain
-- (hazard library, FDA inspections, recall events, qualified individuals,
-- subscription billing, API credentials, onboarding steps, etc). Migration
-- 014 ("thrushcross_verify_redesign") replaced that with the simpler schema
-- the app actually runs on today, and some of what 014 itself introduced
-- (organizations, user_roles, role_permissions, reviews/review_comments/
-- reviewer_assignments, document_reviews/document_versions, commodities,
-- verification_activities, record_signatures, etc.) was never wired to any
-- page or API route either — the real implementation ended up simpler still
-- (e.g. review state lives directly on `documents.evidence_status`, not a
-- separate `reviews` table; roles live on `profiles.role`, not `user_roles`).
--
-- Every table below was confirmed to have zero `.from("table_name")`
-- references anywhere in app/, lib/, or components/ as of 2026-07-28.
--
-- Cross-reference check: a handful of tables you DO use still carry legacy,
-- always-nullable foreign key columns pointing at tables in this drop list.
-- None of these columns are written or read by current app code — they're
-- dead columns riding along on live tables from the pre-014 schema. Dropping
-- the referenced table with CASCADE removes only the FK CONSTRAINT (not the
-- column, not the table, not any data) on:
--
--   corrective_actions.food_id                 -> foods
--   corrective_actions.documented_by_qi_id      -> qualified_individuals
--   fsvp_reassessments.target_food_id           -> foods
--   fsvp_reassessments.performed_by_qi_id       -> qualified_individuals
--   documents.translated_by_qi_id               -> qualified_individuals
--   documents.uploaded_by_user_id               -> importer_users
--   suppliers.organization_id                   -> organizations
--   products_verify.commodity_id                -> commodities
--   notification_deliveries.reminder_id         -> reminders
--   requirement_evidence.document_version_id    -> document_versions
--
-- If you'd rather also remove those now-pointless columns from the live
-- tables, that's a separate, follow-up migration — this one only touches
-- the 51 unused tables themselves.
--
-- Preflight (run this yourself before applying — confirms every table below
-- is actually empty in your environment; investigate before dropping if not):
--
--   select table_name, (xpath('/row/c/text()',
--     query_to_xml(format('select count(*) as c from %I', table_name), false, true, '')))[1]::text::int as row_count
--   from unnest(array[
--     'api_credentials','audit_details','audit_substitution_assurances','commodities','commodity_risks',
--     'compliance_alerts','country_equivalence_recognitions','customer_disclosure_assurances',
--     'document_access_log','document_reviews','document_templates','document_versions',
--     'eligibility_attestations','fda_inspection_observations','fda_inspections','fda_request_bundles',
--     'food_supply_chain_links','foods','fsvp_reassessment_outcomes','hazard_analyses',
--     'hazard_analysis_hazards','hazard_library','hazard_library_versions','import_entries',
--     'importer_entry_identities','importer_users','onboarding_steps','organizations','qi_credentials',
--     'qualified_individuals','readiness_reports','recall_events','record_signatures','reminders',
--     'review_comments','reviewer_assignments','reviews','role_permissions','sampling_test_results',
--     'scheduled_job_runs','subscription_entitlements','supplier_evaluations','supplier_facilities',
--     'supplier_portal_tokens','supplier_portal_uploads','supplier_products','supplier_written_assurances',
--     'user_roles','verification_activities','verification_nonconformities','vsi_thresholds'
--   ]) as table_name
--   order by row_count desc nulls last;
--
-- If any table comes back non-empty and that data matters, pull it out
-- (pg_dump that table, or copy it into a `_archive` schema) before running
-- the drop below.

begin;

drop table if exists
  api_credentials,
  audit_details,
  audit_substitution_assurances,
  commodities,
  commodity_risks,
  compliance_alerts,
  country_equivalence_recognitions,
  customer_disclosure_assurances,
  document_access_log,
  document_reviews,
  document_templates,
  document_versions,
  eligibility_attestations,
  fda_inspection_observations,
  fda_inspections,
  fda_request_bundles,
  food_supply_chain_links,
  foods,
  fsvp_reassessment_outcomes,
  hazard_analyses,
  hazard_analysis_hazards,
  hazard_library,
  hazard_library_versions,
  import_entries,
  importer_entry_identities,
  importer_users,
  onboarding_steps,
  organizations,
  qi_credentials,
  qualified_individuals,
  readiness_reports,
  recall_events,
  record_signatures,
  reminders,
  review_comments,
  reviewer_assignments,
  reviews,
  role_permissions,
  sampling_test_results,
  scheduled_job_runs,
  subscription_entitlements,
  supplier_evaluations,
  supplier_facilities,
  supplier_portal_tokens,
  supplier_portal_uploads,
  supplier_products,
  supplier_written_assurances,
  user_roles,
  verification_activities,
  verification_nonconformities,
  vsi_thresholds
cascade;

commit;
