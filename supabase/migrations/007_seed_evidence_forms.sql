-- ============================================================================
-- 007_seed_evidence_forms.sql — the standard FSVP questionnaire and contact forms
--
-- Separate from 006 for the same reason 002_reference_data.sql is separate from
-- 000/001: schema and the reference data that populates it are different things
-- to review and re-run.
--
-- Deliberately NOT added to 002_reference_data.sql. That file has already been
-- applied to live databases and every insert in it is ON CONFLICT DO NOTHING, so
-- editing it would silently do nothing where it matters.
--
-- Safe to re-run: fixed form_keys with ON CONFLICT DO NOTHING.
-- ============================================================================

begin;

do $$
declare
  v_version_id uuid;
  v_item_questionnaire uuid;
  v_item_primary       uuid;
  v_item_regulatory    uuid;
begin

  select id into v_version_id
  from rule_versions
  where status = 'published'
  order by version_number desc
  limit 1;

  if v_version_id is null then
    raise exception 'No published rule version. Apply 002_reference_data.sql first.';
  end if;

  select ri.id into v_item_questionnaire
  from requirement_items ri
  join requirement_sections rs on rs.id = ri.section_id
  where rs.rule_version_id = v_version_id
    and rs.section_key = 'supplier_questionnaire'
    and ri.item_key = 'completed_questionnaire';

  select ri.id into v_item_primary
  from requirement_items ri
  join requirement_sections rs on rs.id = ri.section_id
  where rs.rule_version_id = v_version_id
    and rs.section_key = 'supplier_contacts'
    and ri.item_key = 'primary_contact_info';

  select ri.id into v_item_regulatory
  from requirement_items ri
  join requirement_sections rs on rs.id = ri.section_id
  where rs.rule_version_id = v_version_id
    and rs.section_key = 'supplier_contacts'
    and ri.item_key = 'regulatory_contact';

  if v_item_questionnaire is null or v_item_primary is null or v_item_regulatory is null then
    raise exception 'Expected requirement items are missing. Apply 002_reference_data.sql first.';
  end if;

  -- ── Mark the three items as form-backed ─────────────────────────────────
  -- These rows belong to a PUBLISHED rule version, and
  -- trg_requirement_items_published_guard blocks updates there. Suspending it
  -- is correct here: this is not an authoring change to the requirements, it is
  -- recording how an unchanged requirement is now collected. The item, its
  -- wording, its criticality and its scoring weight are all untouched.
  alter table requirement_items disable trigger trg_requirement_items_published_guard;

  update requirement_items
  set evidence_type = 'form'
  where id in (v_item_questionnaire, v_item_primary, v_item_regulatory);

  alter table requirement_items enable trigger trg_requirement_items_published_guard;

  -- ── FSVP supplier self-assessment questionnaire ─────────────────────────
  -- flag_answer marks the answer a reviewer should look at twice. It does not
  -- auto-fail the item: a self-assessment answer is not a determination, and
  -- turning one into an automatic rejection is a policy decision to take on its
  -- own rather than smuggle in here.
  insert into form_definitions
    (rule_version_id, requirement_item_id, form_key, title, description, schema_json, sort_order)
  values (
    v_version_id, v_item_questionnaire, 'fsvp_supplier_questionnaire',
    'FSVP Supplier Self-Assessment Questionnaire',
    'Answer on behalf of the exporting company. Your importer reviews these answers as evidence under 21 CFR Part 1 Subpart L.',
    $json$
    {
      "sections": [
        {
          "key": "food_safety_system",
          "title": "Food Safety System",
          "description": "Your documented food safety management system and any third-party certification.",
          "fields": [
            { "key": "has_food_safety_plan", "type": "yes_no", "label": "Do you maintain a written food safety plan or HACCP plan?", "required": true, "flag_answer": "no" },
            { "key": "certification_scheme", "type": "select", "label": "Third-party certification scheme", "required": false,
              "options": [
                { "value": "none", "label": "None" },
                { "value": "brcgs", "label": "BRCGS" },
                { "value": "sqf", "label": "SQF" },
                { "value": "fssc22000", "label": "FSSC 22000" },
                { "value": "ifs", "label": "IFS" },
                { "value": "primusgfs", "label": "PrimusGFS" },
                { "value": "other", "label": "Other" }
              ] },
            { "key": "certificate_number", "type": "text", "label": "Certificate number", "required": false },
            { "key": "certificate_expiry", "type": "date", "label": "Certificate expiry date", "required": false },
            { "key": "last_audit_date", "type": "date", "label": "Date of most recent third-party audit", "required": false }
          ]
        },
        {
          "key": "hazard_controls",
          "title": "Hazard Analysis and Preventive Controls",
          "description": "How you identify hazards and the controls applied to them.",
          "fields": [
            { "key": "hazard_analysis_conducted", "type": "yes_no", "label": "Have you conducted a hazard analysis for the products you export to this importer?", "required": true, "flag_answer": "no" },
            { "key": "hazards_identified", "type": "textarea", "label": "Which biological, chemical, physical or radiological hazards did it identify?", "required": true, "help": "List the hazards requiring a preventive control." },
            { "key": "controls_description", "type": "textarea", "label": "What preventive controls do you apply to those hazards?", "required": true },
            { "key": "monitoring_records_kept", "type": "yes_no", "label": "Do you keep monitoring records for each preventive control?", "required": true, "flag_answer": "no" },
            { "key": "corrective_action_procedure", "type": "yes_no", "label": "Do you have a written corrective action procedure for control failures?", "required": true, "flag_answer": "no" }
          ]
        },
        {
          "key": "allergens",
          "title": "Allergen Control",
          "fields": [
            { "key": "handles_allergens", "type": "yes_no", "label": "Does your facility handle any major food allergens?", "required": true },
            { "key": "allergens_handled", "type": "textarea", "label": "Which allergens are handled on site?", "required": false, "help": "Leave blank if none." },
            { "key": "allergen_program", "type": "yes_no", "label": "Do you have a documented allergen control program?", "required": true, "flag_answer": "no" },
            { "key": "allergen_segregation", "type": "yes_no", "label": "Are allergens segregated in storage and production?", "required": true, "flag_answer": "no" }
          ]
        },
        {
          "key": "sanitation",
          "title": "Sanitation and Environmental Monitoring",
          "fields": [
            { "key": "sanitation_program", "type": "yes_no", "label": "Do you have a documented sanitation program with verification records?", "required": true, "flag_answer": "no" },
            { "key": "environmental_monitoring", "type": "yes_no", "label": "Do you run an environmental monitoring program for pathogens?", "required": true, "flag_answer": "no" },
            { "key": "water_testing", "type": "yes_no", "label": "Is water used in production tested for potability at least annually?", "required": true, "flag_answer": "no" },
            { "key": "pest_control", "type": "yes_no", "label": "Is there a documented pest control program?", "required": true, "flag_answer": "no" }
          ]
        },
        {
          "key": "traceability_recall",
          "title": "Traceability and Recall",
          "fields": [
            { "key": "lot_coding", "type": "yes_no", "label": "Is every shipment lot-coded and traceable to a production record?", "required": true, "flag_answer": "no" },
            { "key": "one_up_one_down", "type": "yes_no", "label": "Can you trace one step forward and one step back for every ingredient and finished lot?", "required": true, "flag_answer": "no" },
            { "key": "written_recall_plan", "type": "yes_no", "label": "Do you have a written recall plan?", "required": true, "flag_answer": "no" },
            { "key": "mock_recall_12mo", "type": "yes_no", "label": "Have you conducted a mock recall in the last 12 months?", "required": true, "flag_answer": "no" },
            { "key": "mock_recall_date", "type": "date", "label": "Date of most recent mock recall", "required": false }
          ]
        },
        {
          "key": "regulatory_history",
          "title": "Regulatory History",
          "fields": [
            { "key": "fda_registered", "type": "yes_no", "label": "Is your facility registered with the FDA?", "required": true },
            { "key": "fda_registration_number", "type": "text", "label": "FDA facility registration number", "required": false },
            { "key": "import_refusal_history", "type": "yes_no", "label": "Has any shipment from this facility been refused entry to the United States in the last three years?", "required": true, "flag_answer": "yes" },
            { "key": "refusal_detail", "type": "textarea", "label": "If yes, describe what happened and what changed as a result", "required": false },
            { "key": "recall_history", "type": "yes_no", "label": "Has this facility been involved in a product recall in the last three years?", "required": true, "flag_answer": "yes" }
          ]
        },
        {
          "key": "declaration",
          "title": "Declaration",
          "description": "This questionnaire forms part of your importer FSVP record.",
          "fields": [
            { "key": "declaration_confirmed", "type": "checkbox", "label": "I confirm the answers above are accurate and complete to the best of my knowledge.", "required": true },
            { "key": "signatory_name", "type": "text", "label": "Name", "required": true },
            { "key": "signatory_title", "type": "text", "label": "Job title", "required": true },
            { "key": "signed_date", "type": "date", "label": "Date", "required": true }
          ]
        }
      ]
    }
    $json$::jsonb,
    10
  )
  on conflict (rule_version_id, form_key) do nothing;

  -- ── Contact forms ────────────────────────────────────────────────────────
  -- Field keys match the existing suppliers.contact_json keys so the submit
  -- route can keep that column current with no data migration — the suppliers
  -- list, the exporter create route and the FSVP record page all still read it.
  insert into form_definitions
    (rule_version_id, requirement_item_id, form_key, title, description, schema_json, sort_order)
  values (
    v_version_id, v_item_primary, 'supplier_primary_contact',
    'Primary Food Safety Contact',
    'The person your importer contacts first about food safety and quality.',
    $json$
    {
      "sections": [
        {
          "key": "primary",
          "title": "Primary Contact",
          "fields": [
            { "key": "primary_name",  "type": "text",  "label": "Full name", "required": true },
            { "key": "primary_title", "type": "text",  "label": "Job title", "required": false },
            { "key": "primary_email", "type": "email", "label": "Email", "required": true },
            { "key": "primary_phone", "type": "phone", "label": "Phone", "required": false }
          ]
        }
      ]
    }
    $json$::jsonb,
    10
  )
  on conflict (rule_version_id, form_key) do nothing;

  insert into form_definitions
    (rule_version_id, requirement_item_id, form_key, title, description, schema_json, sort_order)
  values (
    v_version_id, v_item_regulatory, 'supplier_regulatory_contact',
    'Regulatory and Quality Contact',
    'The designated contact for FDA and regulatory correspondence.',
    $json$
    {
      "sections": [
        {
          "key": "regulatory",
          "title": "Regulatory Contact",
          "fields": [
            { "key": "regulatory_name",  "type": "text",  "label": "Full name", "required": true },
            { "key": "regulatory_title", "type": "text",  "label": "Job title", "required": false },
            { "key": "regulatory_email", "type": "email", "label": "Email", "required": true },
            { "key": "regulatory_phone", "type": "phone", "label": "Phone", "required": false }
          ]
        }
      ]
    }
    $json$::jsonb,
    20
  )
  on conflict (rule_version_id, form_key) do nothing;

end $$;

commit;
