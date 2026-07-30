-- ============================================================================
-- sample_data.sql — development fixture
--
-- Seeds TWO INDEPENDENT importer tenants with completely disjoint suppliers,
-- facilities, products, documents and FSVP records. That is deliberate: the
-- fixture exists to prove tenancy isolation. Sign in as an importer attached to
-- GreenPath and you must see none of Pacific Coast's data, and vice versa.
--
-- Prerequisites: 000_baseline.sql, 001_baseline_rls.sql, 002_reference_data.sql.
--
-- This file seeds business data only — no profiles, because profiles.id
-- references auth.users and Supabase Auth owns that table. To attach a real
-- account to one of these tenants:
--
--   1. Sign up through the app as an Importer.
--   2. Approve the account in the admin screen, which creates an importers row.
--   3. To point that account at a seeded tenant instead, run:
--        update profiles
--        set importer_id = '11111111-1111-1111-1111-111111111111',  -- GreenPath
--            user_status = 'active'
--        where email = 'you@example.com';
--
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING against fixed UUIDs.
-- ============================================================================

begin;

do $$
declare
  -- ── Tenants ────────────────────────────────────────────────────────────
  v_imp_green   uuid := '11111111-1111-1111-1111-111111111111';
  v_imp_pacific uuid := '22222222-2222-2222-2222-222222222222';

  -- ── GreenPath's exporters ──────────────────────────────────────────────
  v_sup_valley  uuid := 'a1000000-0000-0000-0000-000000000001';  -- self-managed
  v_sup_andes   uuid := 'a1000000-0000-0000-0000-000000000002';  -- importer-managed

  -- ── Pacific Coast's exporter ───────────────────────────────────────────
  v_sup_mekong  uuid := 'a2000000-0000-0000-0000-000000000001';

  v_fac_valley  uuid := 'b1000000-0000-0000-0000-000000000001';
  v_fac_andes   uuid := 'b1000000-0000-0000-0000-000000000002';
  v_fac_mekong  uuid := 'b2000000-0000-0000-0000-000000000001';

  v_prod_mango  uuid := 'c1000000-0000-0000-0000-000000000001';
  v_prod_quinoa uuid := 'c1000000-0000-0000-0000-000000000002';
  v_prod_rice   uuid := 'c2000000-0000-0000-0000-000000000001';

  v_doc_valley_1 uuid := 'd1000000-0000-0000-0000-000000000001';
  v_doc_valley_2 uuid := 'd1000000-0000-0000-0000-000000000002';
  v_doc_andes_1  uuid := 'd1000000-0000-0000-0000-000000000003';
  v_doc_mekong_1 uuid := 'd2000000-0000-0000-0000-000000000001';

  v_rec_approved uuid := 'e1000000-0000-0000-0000-000000000001';
  v_rec_draft    uuid := 'e1000000-0000-0000-0000-000000000002';
  v_rec_pacific  uuid := 'e2000000-0000-0000-0000-000000000001';

  v_version_id  uuid;
begin

  select id into v_version_id
  from rule_versions
  where status = 'published'
  order by version_number desc
  limit 1;

  if v_version_id is null then
    raise exception 'No published rule version. Apply 002_reference_data.sql first.';
  end if;

  -- ── Importers ───────────────────────────────────────────────────────────
  insert into importers (id, legal_name, display_name, ein, duns_number, food_scope, address_json)
  values
    (v_imp_green, 'GreenPath Foods LLC', 'GreenPath Foods', '84-1122334', '079384521',
     'human',
     '{"street":"100 Import Lane","city":"New York","state":"NY","zip":"10001","country":"US"}'),
    (v_imp_pacific, 'Pacific Coast Imports Inc.', 'Pacific Coast Imports', '91-5566778', '112233445',
     'both',
     '{"street":"200 Trade Blvd","city":"San Francisco","state":"CA","zip":"94102","country":"US"}')
  on conflict (id) do nothing;

  -- ── Exporters ───────────────────────────────────────────────────────────
  -- Pacific Valley registered itself; GreenPath merely linked to it.
  insert into suppliers (id, company_name, legal_entity_name, country, address_json,
    contact_json, fda_registration_number, supplier_type, approval_status,
    certification_status, record_mode, duns_number)
  values
    (v_sup_valley, 'Pacific Valley Foods', 'Pacific Valley Foods Ltd.', 'Chile',
     '{"street":"Av. Las Condes 123","city":"Santiago","country":"CL"}',
     '{"name":"Carlos Mendez","email":"cmendez@pvfoods.cl","phone":"+56-2-2345-6789"}',
     'FEI-10012345', 'exporter', 'approved', 'approved', 'self_managed', '556677889')
  on conflict (id) do nothing;

  -- Andes never registered. GreenPath created and maintains the record, and is
  -- therefore responsible for uploading and attesting to its evidence.
  insert into suppliers (id, company_name, legal_entity_name, country, address_json,
    contact_json, supplier_type, approval_status, certification_status,
    record_mode, managed_by_importer_id)
  values
    (v_sup_andes, 'Andes Ingredients', 'Andes Ingredients S.A.', 'Peru',
     '{"street":"Jr. Union 456","city":"Lima","country":"PE"}',
     '{"name":"Lucia Ramos","email":"lramos@andesing.pe"}',
     'exporter', 'pending_review', 'pending_review',
     'importer_managed', v_imp_green)
  on conflict (id) do nothing;

  insert into suppliers (id, company_name, legal_entity_name, country, address_json,
    contact_json, fda_registration_number, supplier_type, approval_status,
    certification_status, record_mode)
  values
    (v_sup_mekong, 'Mekong Delta Exports', 'Mekong Delta Exports JSC', 'Vietnam',
     '{"street":"12 Nguyen Hue","city":"Ho Chi Minh City","country":"VN"}',
     '{"name":"Tran Minh","email":"tminh@mekongdelta.vn"}',
     'FEI-20055667', 'exporter', 'approved', 'approved', 'self_managed')
  on conflict (id) do nothing;

  -- ── Relationships ───────────────────────────────────────────────────────
  insert into supplier_relationships (relationship_type, importer_id, supplier_id, status)
  values
    ('importer_supplier', v_imp_green,   v_sup_valley, 'active'),
    ('importer_supplier', v_imp_green,   v_sup_andes,  'active'),
    ('importer_supplier', v_imp_pacific, v_sup_mekong, 'active')
  on conflict (importer_id, supplier_id) do nothing;

  -- ── Facilities ──────────────────────────────────────────────────────────
  insert into facilities_verify (id, importer_id, supplier_id, facility_name,
    facility_address_json, facility_type, fda_registration_number, approval_status,
    rule_version_id)
  values
    (v_fac_valley, v_imp_green, v_sup_valley, 'Santiago Processing Plant',
     '{"street":"Ruta 5 Sur km 32","city":"Santiago","country":"CL"}',
     'processing', 'FEI-10012345', 'approved', v_version_id),
    (v_fac_andes, v_imp_green, v_sup_andes, 'Lima Dry Goods Facility',
     '{"street":"Av. Argentina 890","city":"Lima","country":"PE"}',
     'packing', null, 'pending', v_version_id),
    (v_fac_mekong, v_imp_pacific, v_sup_mekong, 'Can Tho Mill',
     '{"street":"Lot 7 Tra Noc IZ","city":"Can Tho","country":"VN"}',
     'processing', 'FEI-20055667', 'approved', v_version_id)
  on conflict (id) do nothing;

  insert into facility_supplier_access (facility_id, supplier_id, importer_id, access_level)
  values
    (v_fac_valley, v_sup_valley, v_imp_green,   'manage'),
    (v_fac_andes,  v_sup_andes,  v_imp_green,   'manage'),
    (v_fac_mekong, v_sup_mekong, v_imp_pacific, 'manage')
  on conflict (facility_id, supplier_id) do nothing;

  -- ── Products ────────────────────────────────────────────────────────────
  insert into products_verify (id, importer_id, supplier_id, facility_id, product_name,
    product_description, country_of_origin, raw_or_processed, intended_use,
    allergen_information, approval_status, rule_version_id)
  values
    (v_prod_mango, v_imp_green, v_sup_valley, v_fac_valley, 'Mango Puree',
     'Aseptic mango puree, 220kg drums', 'Chile', 'processed', 'further_processed',
     'None declared', 'approved', v_version_id),
    (v_prod_quinoa, v_imp_green, v_sup_andes, v_fac_andes, 'Organic Quinoa',
     'Washed white quinoa, 25kg bags', 'Peru', 'raw', 'ingredient',
     'None declared', 'pending', v_version_id),
    (v_prod_rice, v_imp_pacific, v_sup_mekong, v_fac_mekong, 'Jasmine Rice',
     'Long grain jasmine rice, 50lb bags', 'Vietnam', 'raw', 'ingredient',
     'None declared', 'approved', v_version_id)
  on conflict (id) do nothing;

  -- ── Documents ───────────────────────────────────────────────────────────
  -- Pacific Valley uploaded their own; note evidence_source = supplier_attested.
  insert into documents (id, importer_id, supplier_id, facility_id, document_kind, title,
    storage_path, original_filename, mime_type, size_bytes, sha256,
    linked_entity_type, linked_entity_id, evidence_status, evidence_source,
    expiration_date, rule_version_id)
  values
    (v_doc_valley_1, v_imp_green, v_sup_valley, v_fac_valley, 'audit_report',
     'SQF Certification 2026', 'seed/valley/sqf-2026.pdf', 'sqf-2026.pdf',
     'application/pdf', 284120, repeat('a', 64),
     'facility', v_fac_valley, 'accepted', 'supplier_attested',
     (current_date + interval '8 months')::date, v_version_id),
    (v_doc_valley_2, v_imp_green, v_sup_valley, v_fac_valley, 'certificate_of_analysis',
     'Mango Puree COA — Lot 4471', 'seed/valley/coa-4471.pdf', 'coa-4471.pdf',
     'application/pdf', 91500, repeat('b', 64),
     'product', v_prod_mango, 'submitted', 'supplier_attested',
     null, v_version_id)
  on conflict (id) do nothing;

  -- Andes has no account, so GreenPath uploaded this on their behalf. The
  -- provenance columns record who actually provided it and when.
  insert into documents (id, importer_id, supplier_id, facility_id, document_kind, title,
    storage_path, original_filename, mime_type, size_bytes, sha256,
    linked_entity_type, linked_entity_id, evidence_status, evidence_source,
    attested_by_name, attested_at, rule_version_id)
  values
    (v_doc_andes_1, v_imp_green, v_sup_andes, v_fac_andes, 'supplier_questionnaire',
     'Andes FSVP Questionnaire (emailed)', 'seed/andes/questionnaire.pdf',
     'questionnaire.pdf', 'application/pdf', 145300, repeat('c', 64),
     'supplier', v_sup_andes, 'accepted', 'importer_uploaded',
     'Lucia Ramos, QA Manager', now() - interval '20 days', v_version_id)
  on conflict (id) do nothing;

  insert into documents (id, importer_id, supplier_id, facility_id, document_kind, title,
    storage_path, original_filename, mime_type, size_bytes, sha256,
    linked_entity_type, linked_entity_id, evidence_status, evidence_source, rule_version_id)
  values
    (v_doc_mekong_1, v_imp_pacific, v_sup_mekong, v_fac_mekong, 'food_safety_plan',
     'Mekong HACCP Plan v3', 'seed/mekong/haccp-v3.pdf', 'haccp-v3.pdf',
     'application/pdf', 512000, repeat('d', 64),
     'facility', v_fac_mekong, 'accepted', 'supplier_attested', v_version_id)
  on conflict (id) do nothing;

  -- ── FSVP records ────────────────────────────────────────────────────────
  insert into fsvp_records (id, importer_id, supplier_id, facility_id, product_id,
    rule_version_id, status, hazard_analysis_notes, supplier_evaluation_notes,
    facility_evaluation_notes, verification_determination, overall_score,
    approval_decision, approved_at, reassessment_due_at)
  values
    (v_rec_approved, v_imp_green, v_sup_valley, v_fac_valley, v_prod_mango,
     v_version_id, 'importer_approved',
     'Primary hazards: Salmonella (controlled by aseptic thermal process), patulin from mould-damaged fruit (controlled by incoming inspection).',
     'SQF-certified since 2021, no FDA import refusals on record, two prior shipments accepted without deviation.',
     'Facility audited on-site 2026-03-14. Thermal process validated, CCP monitoring records complete.',
     'Annual on-site audit plus per-lot COA. Adequate given the SAHCODHA hazard is controlled at the facility.',
     94.0, 'approved', now() - interval '60 days', now() + interval '305 days'),
    (v_rec_draft, v_imp_green, v_sup_andes, v_fac_andes, v_prod_quinoa,
     v_version_id, 'draft',
     null, null, null, null, null, null, null, null)
  on conflict (id) do nothing;

  insert into fsvp_records (id, importer_id, supplier_id, facility_id, product_id,
    rule_version_id, status, overall_score)
  values
    (v_rec_pacific, v_imp_pacific, v_sup_mekong, v_fac_mekong, v_prod_rice,
     v_version_id, 'importer_review_pending', 78.5)
  on conflict (id) do nothing;

  insert into fsvp_record_evidence (fsvp_record_id, document_id, notes)
  values
    (v_rec_approved, v_doc_valley_1, 'Facility certification supporting approval'),
    (v_rec_approved, v_doc_valley_2, 'Lot-level COA'),
    (v_rec_pacific,  v_doc_mekong_1, 'HACCP plan under review')
  on conflict (fsvp_record_id, document_id) do nothing;

  insert into reassessment_schedules (fsvp_record_id, importer_id, frequency_months,
    last_assessed_at, next_due_at, status)
  values
    (v_rec_approved, v_imp_green, 12, now() - interval '60 days',
     now() + interval '305 days', 'scheduled')
  on conflict do nothing;

  -- ── Corrective action (Pacific Coast only) ──────────────────────────────
  insert into corrective_actions (importer_id, supplier_id, product_id, triggered_by,
    issue_description, status, triggered_at)
  values
    (v_imp_pacific, v_sup_mekong, v_prod_rice, 'verification_finding',
     'Moisture content exceeded specification on lot MD-2291; supplier response pending.',
     'open', now() - interval '9 days')
  on conflict do nothing;

  raise notice 'Seeded 2 importer tenants: GreenPath (%) and Pacific Coast (%)',
    v_imp_green, v_imp_pacific;
end $$;

commit;
