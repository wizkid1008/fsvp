-- 024_seed_test_data.sql
-- Idempotent seed data for development/demo.
-- Creates 2 importers, 3 suppliers, 5 facilities, 10 products,
-- FSVP records in every status, and corrective actions.
-- Uses ON CONFLICT DO NOTHING throughout.

do $$
declare
  -- Fixed UUIDs for deterministic seeding
  v_importer_1    uuid := 'a1000000-0000-0000-0000-000000000001';
  v_importer_2    uuid := 'a1000000-0000-0000-0000-000000000002';

  v_supplier_1    uuid := 'b2000000-0000-0000-0000-000000000001'; -- Pacific Valley Foods
  v_supplier_2    uuid := 'b2000000-0000-0000-0000-000000000002'; -- Andes Ingredients
  v_supplier_3    uuid := 'b2000000-0000-0000-0000-000000000003'; -- Coastal Preserves

  v_facility_1    uuid := 'c3000000-0000-0000-0000-000000000001'; -- Santiago Plant 2 (PVF)
  v_facility_2    uuid := 'c3000000-0000-0000-0000-000000000002'; -- Valparaiso Warehouse (PVF)
  v_facility_3    uuid := 'c3000000-0000-0000-0000-000000000003'; -- Bogota Processing (Andes)
  v_facility_4    uuid := 'c3000000-0000-0000-0000-000000000004'; -- Lima Plant (Andes)
  v_facility_5    uuid := 'c3000000-0000-0000-0000-000000000005'; -- Buenos Aires Cold (Coastal)

  v_product_1     uuid := 'd4000000-0000-0000-0000-000000000001'; -- Mango Puree (f1)
  v_product_2     uuid := 'd4000000-0000-0000-0000-000000000002'; -- Dried Mango (f2)
  v_product_3     uuid := 'd4000000-0000-0000-0000-000000000003'; -- Roasted Coffee (f3)
  v_product_4     uuid := 'd4000000-0000-0000-0000-000000000004'; -- Green Coffee Beans (f3)
  v_product_5     uuid := 'd4000000-0000-0000-0000-000000000005'; -- Cocoa Powder (f4)
  v_product_6     uuid := 'd4000000-0000-0000-0000-000000000006'; -- Cocoa Nibs (f4)
  v_product_7     uuid := 'd4000000-0000-0000-0000-000000000007'; -- Peanuts Raw (f5)
  v_product_8     uuid := 'd4000000-0000-0000-0000-000000000008'; -- Peanut Butter (f5)
  v_product_9     uuid := 'd4000000-0000-0000-0000-000000000009'; -- Dried Berry Mix (f2)
  v_product_10    uuid := 'd4000000-0000-0000-0000-000000000010'; -- Roasted Pepper Strips (f1)

  v_rule_ver_id   uuid;

  v_rec_approved  uuid := 'e5000000-0000-0000-0000-000000000001';
  v_rec_cond      uuid := 'e5000000-0000-0000-0000-000000000002';
  v_rec_rejected  uuid := 'e5000000-0000-0000-0000-000000000003';
  v_rec_expired   uuid := 'e5000000-0000-0000-0000-000000000004';
  v_rec_draft     uuid := 'e5000000-0000-0000-0000-000000000005';
  v_rec_pending   uuid := 'e5000000-0000-0000-0000-000000000006';

  v_doc_1         uuid := 'f6000000-0000-0000-0000-000000000001';
  v_doc_2         uuid := 'f6000000-0000-0000-0000-000000000002';
  v_doc_3         uuid := 'f6000000-0000-0000-0000-000000000003';
  v_doc_4         uuid := 'f6000000-0000-0000-0000-000000000004';

  v_ca_1          uuid := 'a7000000-0000-0000-0000-000000000001';
  v_ca_2          uuid := 'a7000000-0000-0000-0000-000000000002';

begin
  -- ── Importers ─────────────────────────────────────────────────────────────
  insert into importers (id, legal_name, display_name, food_scope, address_json)
  values
    (v_importer_1, 'GreenPath Foods LLC', 'GreenPath Foods',
     'human', '{"street":"100 Import Lane","city":"New York","state":"NY","zip":"10001","country":"US"}'),
    (v_importer_2, 'Pacific Coast Imports Inc.', 'Pacific Coast Imports',
     'both', '{"street":"200 Trade Blvd","city":"San Francisco","state":"CA","zip":"94102","country":"US"}')
  on conflict (id) do nothing;

  -- ── Suppliers ─────────────────────────────────────────────────────────────
  insert into suppliers (id, company_name, legal_entity_name, country, address_json, contact_json,
    fda_registration_number, approval_status, portal_status)
  values
    (v_supplier_1, 'Pacific Valley Foods', 'Pacific Valley Foods Ltd.',
     'Chile', '{"street":"Av. Las Condes 123","city":"Santiago","country":"CL"}',
     '{"name":"Carlos Mendez","email":"cmendez@pvfoods.cl","phone":"+56-2-2345-6789"}',
     'FEI-10012345', 'approved', 'active'),
    (v_supplier_2, 'Andes Ingredients', 'Andes Ingredients S.A.',
     'Colombia', '{"street":"Carrera 15 #80-45","city":"Bogotá","country":"CO"}',
     '{"name":"Sofia Torres","email":"storres@andesingredients.co","phone":"+57-1-234-5678"}',
     'FEI-10067890', 'approved', 'active'),
    (v_supplier_3, 'Coastal Preserves', 'Coastal Preserves S.A.',
     'Argentina', '{"street":"Av. Corrientes 800","city":"Buenos Aires","country":"AR"}',
     '{"name":"Juan Gutierrez","email":"jgutierrez@coastalpreserves.com.ar","phone":"+54-11-4567-8901"}',
     null, 'pending_review', 'active')
  on conflict (id) do nothing;

  -- Importer-supplier links
  insert into importer_supplier_links (importer_id, supplier_id)
  values
    (v_importer_1, v_supplier_1),
    (v_importer_1, v_supplier_2),
    (v_importer_1, v_supplier_3),
    (v_importer_2, v_supplier_1),
    (v_importer_2, v_supplier_2)
  on conflict (importer_id, supplier_id) do nothing;

  -- ── Facilities ────────────────────────────────────────────────────────────
  insert into facilities_verify (id, importer_id, supplier_id, facility_name, facility_address_json,
    facility_type, fda_registration_number, food_safety_certifications, approval_status)
  values
    (v_facility_1, v_importer_1, v_supplier_1, 'Santiago Plant 2',
     '{"street":"Parque Industrial Norte 45","city":"Santiago","country":"CL"}',
     'Manufacturing', 'FEI-20011111', ARRAY['BRCGS Food Safety Grade A'], 'approved'),
    (v_facility_2, v_importer_1, v_supplier_1, 'Valparaiso Warehouse',
     '{"street":"Puerto Sector 12","city":"Valparaíso","country":"CL"}',
     'Storage', null, ARRAY['GMP Certified'], 'conditionally_approved'),
    (v_facility_3, v_importer_1, v_supplier_2, 'Bogota Processing Facility',
     '{"street":"Zona Industrial Montevideo 88","city":"Bogotá","country":"CO"}',
     'Manufacturing', 'FEI-20022222', ARRAY['SQF Level 3','FSSC 22000'], 'approved'),
    (v_facility_4, v_importer_1, v_supplier_2, 'Lima Processing Plant',
     '{"street":"Av. Industrial Sur 900","city":"Lima","country":"PE"}',
     'Manufacturing', 'FEI-20033333', ARRAY['HACCP Certified'], 'improvement_required'),
    (v_facility_5, v_importer_1, v_supplier_3, 'Buenos Aires Cold Storage',
     '{"street":"Puerto Madero Norte 5","city":"Buenos Aires","country":"AR"}',
     'Cold Storage', null, ARRAY[]::text[], 'pending')
  on conflict (id) do nothing;

  -- facility_supplier_access for shared facilities
  insert into facility_supplier_access (facility_id, supplier_id, importer_id, access_level)
  values
    (v_facility_1, v_supplier_1, v_importer_1, 'manage'),
    (v_facility_2, v_supplier_1, v_importer_1, 'manage'),
    (v_facility_3, v_supplier_2, v_importer_1, 'manage'),
    (v_facility_4, v_supplier_2, v_importer_1, 'manage'),
    (v_facility_5, v_supplier_3, v_importer_1, 'manage')
  on conflict (facility_id, supplier_id) do nothing;

  -- ── Products ──────────────────────────────────────────────────────────────
  -- facility_id excluded here — migration 019 adds it; we UPDATE it below
  -- if the column exists, so this block works regardless of migration order.
  insert into products_verify (id, importer_id, supplier_id, product_name,
    product_description, country_of_origin, intended_use, allergen_information, approval_status)
  values
    (v_product_1,  v_importer_1, v_supplier_1, 'Mango Puree',
     'Aseptic mango puree, Alphonso variety', 'Chile', 'ingredient', 'None', 'approved'),
    (v_product_2,  v_importer_1, v_supplier_1, 'Dried Mango Slices',
     'Sulphite-treated dried mango slices', 'Chile', 'ready_to_eat',
     'Contains sulphites', 'conditionally_approved'),
    (v_product_3,  v_importer_1, v_supplier_2, 'Roasted Coffee Beans',
     'Single-origin medium roast, Arabica', 'Colombia', 'ready_to_eat', 'None', 'approved'),
    (v_product_4,  v_importer_1, v_supplier_2, 'Green Coffee Beans',
     'Unroasted Arabica green beans', 'Colombia', 'further_processed', 'None', 'improvement_required'),
    (v_product_5,  v_importer_1, v_supplier_2, 'Cocoa Powder',
     'Natural process 10/12 fat cocoa powder', 'Peru', 'ingredient',
     'May contain traces of tree nuts', 'pending'),
    (v_product_6,  v_importer_1, v_supplier_2, 'Cocoa Nibs',
     'Fermented and dried cocoa nibs', 'Peru', 'ingredient', 'None', 'pending'),
    (v_product_7,  v_importer_1, v_supplier_3, 'Raw Peanuts',
     'Valencia raw peanuts, in shell', 'Argentina', 'further_processed',
     'Contains: Peanuts', 'not_approved'),
    (v_product_8,  v_importer_1, v_supplier_3, 'Peanut Butter',
     'Natural ground peanut butter, no additives', 'Argentina', 'ready_to_eat',
     'Contains: Peanuts. May contain: Tree Nuts', 'not_approved'),
    (v_product_9,  v_importer_1, v_supplier_1, 'Dried Berry Mix',
     'Blend of dried cranberries, blueberries, cherries', 'Chile', 'ready_to_eat',
     'None', 'pending'),
    (v_product_10, v_importer_1, v_supplier_1, 'Roasted Pepper Strips',
     'Fire-roasted red and yellow pepper strips, jar packed', 'Chile', 'ready_to_eat',
     'None', 'improvement_required')
  on conflict (id) do nothing;

  -- Link products to facilities if the column exists (added in migration 019)
  if exists (
    select 1 from information_schema.columns
    where table_name = 'products_verify' and column_name = 'facility_id'
  ) then
    update products_verify set facility_id = v_facility_1 where id = v_product_1;
    update products_verify set facility_id = v_facility_2 where id = v_product_2;
    update products_verify set facility_id = v_facility_3 where id = v_product_3;
    update products_verify set facility_id = v_facility_3 where id = v_product_4;
    update products_verify set facility_id = v_facility_4 where id = v_product_5;
    update products_verify set facility_id = v_facility_4 where id = v_product_6;
    update products_verify set facility_id = v_facility_5 where id = v_product_7;
    update products_verify set facility_id = v_facility_5 where id = v_product_8;
    update products_verify set facility_id = v_facility_2 where id = v_product_9;
    update products_verify set facility_id = v_facility_1 where id = v_product_10;
  end if;

  -- ── Evidence Documents ────────────────────────────────────────────────────
  -- All columns in a single INSERT — no UPDATE, so the set_updated_at()
  -- BEFORE UPDATE trigger on documents never fires.
  -- evidence_status / supplier_id / facility_id exist (migrations 021/023).
  insert into documents (id, importer_id, supplier_id, facility_id,
    document_kind, title, storage_path, original_filename,
    mime_type, size_bytes, sha256,
    linked_entity_type, linked_entity_id, evidence_status, uploaded_via)
  values
    (v_doc_1, v_importer_1, v_supplier_1, v_facility_1,
     'HACCP Plan', 'HACCP Plan – Santiago Plant 2 2026',
     'seed/pvf/haccp-plan-2026.pdf', 'haccp-plan-2026.pdf',
     'application/pdf', 512000, 'aaa000',
     'facility', v_facility_1, 'accepted', 'app'),
    (v_doc_2, v_importer_1, v_supplier_1, v_facility_1,
     'Certificate of Analysis', 'COA – Mango Puree Lot 2026-04',
     'seed/pvf/coa-mango-2026-04.pdf', 'coa-mango-2026-04.pdf',
     'application/pdf', 204800, 'bbb000',
     'product', v_product_1, 'accepted', 'app'),
    (v_doc_3, v_importer_1, v_supplier_2, v_facility_3,
     'Audit Report', 'Third-Party Audit Report 2025 – Bogota',
     'seed/andes/audit-2025.pdf', 'audit-2025.pdf',
     'application/pdf', 1048576, 'ccc000',
     'facility', v_facility_3, 'accepted', 'app'),
    (v_doc_4, v_importer_1, v_supplier_3, v_facility_5,
     'Food Safety Plan', 'Peanut Food Safety Plan – Draft',
     'seed/coastal/fsp-draft.pdf', 'fsp-draft.pdf',
     'application/pdf', 307200, 'ddd000',
     'supplier', v_supplier_3, 'needs_revision', 'app')
  on conflict (id) do nothing;

  -- ── Get published rule version ─────────────────────────────────────────────
  select id into v_rule_ver_id
  from rule_versions
  where status = 'published'
  order by version_number desc
  limit 1;

  if v_rule_ver_id is null then
    raise notice 'No published rule version found — skipping FSVP record seed';
    return;
  end if;

  -- ── FSVP Records ─────────────────────────────────────────────────────────
  insert into fsvp_records (
    id, importer_id, supplier_id, facility_id, product_id, rule_version_id, status,
    hazard_analysis_notes, supplier_evaluation_notes, facility_evaluation_notes,
    verification_determination, overall_score, approval_decision,
    approved_at, reassessment_due_at
  )
  values
    -- 1. Approved
    (v_rec_approved, v_importer_1, v_supplier_1, v_facility_1, v_product_1,
     v_rule_ver_id, 'importer_approved',
     'Biological hazards: Salmonella, E. coli O157:H7 (significant). Chemical: pesticide residues (moderate). Physical: foreign material (low). Mango puree undergoes thermal processing which addresses biological hazards. Chemical controls verified via supplier food safety plan and COA program.',
     'Pacific Valley Foods has maintained BRCGS Grade A certification for 5 consecutive years. Audit history shows consistent compliance. No recall events on record. Written assurance obtained. Supplier evaluation score: 94/100.',
     'Santiago Plant 2 is a dedicated mango processing facility. GMP inspection conducted 2025-11-15 — no major findings. HACCP plan reviewed and accepted. Facility FDA registration current.',
     'Verification activities: Annual records review + lot-specific COA review. Sampling/testing triggered if COA results deviate. Onsite audit every 3 years. Activities are appropriate to the identified hazards.',
     94.5, 'approved',
     now() - interval '60 days',
     now() + interval '305 days'),

    -- 2. Conditionally Approved
    (v_rec_cond, v_importer_1, v_supplier_1, v_facility_2, v_product_2,
     v_rule_ver_id, 'conditionally_approved',
     'Sulphite declaration must be maintained on all lots. Biological hazards low for dried product. Chemical: sulphite levels require COA per lot.',
     'Supplier maintains GMP certification but warehouse facility is separate from primary manufacturing. Supplier rating: 81/100.',
     'Valparaiso Warehouse is a storage-only facility. Minor GMP observations noted in last audit — corrective actions submitted. Approval conditional on closure of finding CAR-2026-001.',
     'Records review of sulphite COA per lot. Corrective action closure review.',
     81.0, 'conditionally_approved',
     now() - interval '30 days',
     now() + interval '335 days'),

    -- 3. Rejected
    (v_rec_rejected, v_importer_1, v_supplier_3, v_facility_5, v_product_7,
     v_rule_ver_id, 'rejected',
     'Aflatoxin control is a critical hazard for peanuts. No validated aflatoxin testing program submitted. No food safety plan accepted. Critical blocker unresolved.',
     'Coastal Preserves has not submitted required FSVP documentation. No certifications on file. Supplier evaluation: 38/100.',
     'Buenos Aires Cold Storage — no FDA registration. No food safety management system documented. GMP compliance unverified.',
     'Cannot determine adequate verification activities without accepted food safety plan.',
     38.0, 'rejected',
     now() - interval '90 days',
     null),

    -- 4. Expired / Reassessment Due
    (v_rec_expired, v_importer_2, v_supplier_1, v_facility_3, v_product_3,
     v_rule_ver_id, 'reassessment_due',
     'Coffee — ochratoxin A is the primary chemical hazard. Pesticide residues (moderate). Roasting process eliminates biological hazards.',
     'Andes Ingredients — SQF Level 3, FSSC 22000 certified. Audit 2024 — no major findings. Reassessment overdue.',
     'Bogota Processing Facility — FDA registered. Strong HACCP documentation. Annual third-party audit on record.',
     'Annual records review + COA per lot. Ochratoxin testing every 6 months.',
     88.0, 'approved',
     now() - interval '400 days',
     now() - interval '35 days'),  -- overdue

    -- 5. Draft
    (v_rec_draft, v_importer_1, v_supplier_2, v_facility_4, v_product_5,
     v_rule_ver_id, 'draft',
     null, null, null, null, null, null, null, null),

    -- 6. Review Pending
    (v_rec_pending, v_importer_1, v_supplier_2, v_facility_3, v_product_4,
     v_rule_ver_id, 'importer_review_pending',
     'Green coffee — ochratoxin and pesticide hazards. Biological hazards low (no kill step). Detailed hazard analysis drafted.',
     'Andes Ingredients — strong record, certification current.',
     'Bogota Processing Facility — same facility as roasted coffee, well-documented.',
     'Pending final importer review and approval decision.',
     79.5, null, null, null)
  on conflict (id) do nothing;

  -- Attach evidence to approved record
  insert into fsvp_record_evidence (fsvp_record_id, document_id, attached_by_profile_id, notes)
  values
    (v_rec_approved, v_doc_1, null, 'HACCP plan accepted by reviewer'),
    (v_rec_approved, v_doc_2, null, 'COA for most recent shipment lot')
  on conflict (fsvp_record_id, document_id) do nothing;

  -- Attach evidence to conditional record
  insert into fsvp_record_evidence (fsvp_record_id, document_id, attached_by_profile_id, notes)
  values
    (v_rec_cond, v_doc_1, null, 'Facility HACCP on file')
  on conflict (fsvp_record_id, document_id) do nothing;

  -- Approval decisions history
  insert into approval_decisions (fsvp_record_id, importer_id, decision, decision_notes,
    conditions_text, decided_by_profile_id, rule_version_id)
  values
    (v_rec_approved, v_importer_1, 'approved',
     'All required evidence accepted. Hazard analysis complete. Verification activities appropriate.',
     null,
     (select id from profiles where role = 'us_importer' limit 1),
     v_rule_ver_id),
    (v_rec_cond, v_importer_1, 'conditionally_approved',
     'Facility approved subject to corrective action closure.',
     'Corrective action CAR-2026-001 must be closed within 60 days. Re-submit sulphite COA for next shipment.',
     (select id from profiles where role = 'us_importer' limit 1),
     v_rule_ver_id),
    (v_rec_rejected, v_importer_1, 'rejected',
     'Critical blocker: no accepted food safety plan. Aflatoxin program not established.',
     null,
     (select id from profiles where role = 'us_importer' limit 1),
     v_rule_ver_id)
  on conflict do nothing;

  -- Reassessment schedules
  insert into reassessment_schedules (fsvp_record_id, importer_id, frequency_months, last_assessed_at, next_due_at, status)
  values
    (v_rec_approved, v_importer_1, 12,
     now() - interval '60 days', now() + interval '305 days', 'scheduled'),
    (v_rec_cond, v_importer_1, 12,
     now() - interval '30 days', now() + interval '335 days', 'scheduled'),
    (v_rec_expired, v_importer_2, 12,
     now() - interval '400 days', now() - interval '35 days', 'overdue')
  on conflict do nothing;

  -- ── Corrective Actions ────────────────────────────────────────────────────
  insert into corrective_actions (id, importer_id, supplier_id, triggered_by, triggered_at,
    issue_description, status)
  values
    (v_ca_1, v_importer_1, v_supplier_3,
     'fsvp_review', now() - interval '45 days',
     'Aflatoxin testing program not established for peanut products. Critical blocker — must resolve before FSVP approval.',
     'open'),
    (v_ca_2, v_importer_1, v_supplier_1,
     'facility_audit', now() - interval '20 days',
     'Minor GMP observation: pest control log incomplete for Q4 2025. Corrective action submitted by supplier — pending closure review.',
     'in_progress')
  on conflict (id) do nothing;

  -- ── Audit log entries ─────────────────────────────────────────────────────
  insert into audit_logs (importer_id, action, record_type, record_id, actor_role,
    new_value, created_at)
  values
    (v_importer_1, 'fsvp_record_created', 'fsvp_records', v_rec_approved, 'us_importer',
     '{"supplier":"Pacific Valley Foods","product":"Mango Puree"}',
     now() - interval '61 days'),
    (v_importer_1, 'fsvp_record_approved', 'fsvp_records', v_rec_approved, 'us_importer',
     '{"decision":"approved","score":94.5}',
     now() - interval '60 days'),
    (v_importer_1, 'evidence_accepted', 'documents', v_doc_1, 'reviewer',
     '{"document":"HACCP Plan – Santiago Plant 2 2026"}',
     now() - interval '65 days'),
    (v_importer_1, 'fsvp_record_conditionally_approved', 'fsvp_records', v_rec_cond, 'us_importer',
     '{"decision":"conditionally_approved","conditions":"CAR-2026-001 closure required"}',
     now() - interval '30 days'),
    (v_importer_1, 'fsvp_record_rejected', 'fsvp_records', v_rec_rejected, 'us_importer',
     '{"decision":"rejected","reason":"Critical blocker: no food safety plan"}',
     now() - interval '90 days')
  on conflict do nothing;

end $$;
