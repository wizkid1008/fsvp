-- ============================================================================
-- 002_reference_data.sql — reference and configuration data
--
-- Extracted verbatim from the archived migrations so the values are unchanged:
--   countries           <- 015_profile_country_reference.sql
--   fsvp_requirements   <- 014_thrushcross_verify_redesign.sql
--   app_settings        <- 018_settings_categories_workflows.sql
--   document_categories <- 018_settings_categories_workflows.sql
--   rule set + v1       <- 021_rules_engine_schema_extensions.sql
--   supplier sections   <- 025_supplier_requirement_sections.sql
--   facility/product    <- 041_seed_facility_product_requirement_items.sql
--
-- This is NOT sample data — the app cannot function without it. Creating an
-- FSVP record requires a published rule version, and the scoring engine reads
-- requirement_sections / requirement_items / scoring_category_weights.
-- Sample tenants and test fixtures live in supabase/seed/sample_data.sql.
-- ============================================================================

begin;

-- ── Countries ───────────────────────────────────────────────────────────────
insert into countries (country_code, country_name) values
  ('AD', 'Andorra'),
  ('AE', 'United Arab Emirates'),
  ('AF', 'Afghanistan'),
  ('AG', 'Antigua & Barbuda'),
  ('AI', 'Anguilla'),
  ('AL', 'Albania'),
  ('AM', 'Armenia'),
  ('AO', 'Angola'),
  ('AR', 'Argentina'),
  ('AS', 'American Samoa'),
  ('AT', 'Austria'),
  ('AU', 'Australia'),
  ('AW', 'Aruba'),
  ('AX', 'Aland Islands'),
  ('AZ', 'Azerbaijan'),
  ('BA', 'Bosnia & Herzegovina'),
  ('BB', 'Barbados'),
  ('BD', 'Bangladesh'),
  ('BE', 'Belgium'),
  ('BF', 'Burkina Faso'),
  ('BG', 'Bulgaria'),
  ('BH', 'Bahrain'),
  ('BI', 'Burundi'),
  ('BJ', 'Benin'),
  ('BL', 'St. Barthelemy'),
  ('BM', 'Bermuda'),
  ('BN', 'Brunei'),
  ('BO', 'Bolivia'),
  ('BQ', 'Bonaire, Sint Eustatius and Saba'),
  ('BR', 'Brazil'),
  ('BS', 'Bahamas'),
  ('BT', 'Bhutan'),
  ('BW', 'Botswana'),
  ('BY', 'Belarus'),
  ('BZ', 'Belize'),
  ('CA', 'Canada'),
  ('CC', 'Cocos (Keeling) Islands'),
  ('CD', 'Congo (DRC)'),
  ('CF', 'Central African Republic'),
  ('CG', 'Congo'),
  ('CH', 'Switzerland'),
  ('CI', 'Cote d''Ivoire'),
  ('CK', 'Cook Islands'),
  ('CL', 'Chile'),
  ('CM', 'Cameroon'),
  ('CN', 'China'),
  ('CO', 'Colombia'),
  ('CR', 'Costa Rica'),
  ('CU', 'Cuba'),
  ('CV', 'Cabo Verde'),
  ('CW', 'Curacao'),
  ('CX', 'Christmas Island'),
  ('CY', 'Cyprus'),
  ('CZ', 'Czechia'),
  ('DE', 'Germany'),
  ('DJ', 'Djibouti'),
  ('DK', 'Denmark'),
  ('DM', 'Dominica'),
  ('DO', 'Dominican Republic'),
  ('DZ', 'Algeria'),
  ('EC', 'Ecuador'),
  ('EE', 'Estonia'),
  ('EG', 'Egypt'),
  ('ER', 'Eritrea'),
  ('ES', 'Spain'),
  ('ET', 'Ethiopia'),
  ('FI', 'Finland'),
  ('FJ', 'Fiji'),
  ('FK', 'Falkland Islands'),
  ('FM', 'Micronesia'),
  ('FO', 'Faroe Islands'),
  ('FR', 'France'),
  ('GA', 'Gabon'),
  ('GB', 'United Kingdom'),
  ('GD', 'Grenada'),
  ('GE', 'Georgia'),
  ('GF', 'French Guiana'),
  ('GG', 'Guernsey'),
  ('GH', 'Ghana'),
  ('GI', 'Gibraltar'),
  ('GL', 'Greenland'),
  ('GM', 'Gambia'),
  ('GN', 'Guinea'),
  ('GP', 'Guadeloupe'),
  ('GQ', 'Equatorial Guinea'),
  ('GR', 'Greece'),
  ('GT', 'Guatemala'),
  ('GU', 'Guam'),
  ('GW', 'Guinea-Bissau'),
  ('GY', 'Guyana'),
  ('HK', 'Hong Kong SAR'),
  ('HN', 'Honduras'),
  ('HR', 'Croatia'),
  ('HT', 'Haiti'),
  ('HU', 'Hungary'),
  ('ID', 'Indonesia'),
  ('IE', 'Ireland'),
  ('IL', 'Israel'),
  ('IM', 'Isle of Man'),
  ('IN', 'India'),
  ('IO', 'British Indian Ocean Territory'),
  ('IQ', 'Iraq'),
  ('IR', 'Iran'),
  ('IS', 'Iceland'),
  ('IT', 'Italy'),
  ('JE', 'Jersey'),
  ('JM', 'Jamaica'),
  ('JO', 'Jordan'),
  ('JP', 'Japan'),
  ('KE', 'Kenya'),
  ('KG', 'Kyrgyzstan'),
  ('KH', 'Cambodia'),
  ('KI', 'Kiribati'),
  ('KM', 'Comoros'),
  ('KN', 'St. Kitts & Nevis'),
  ('KP', 'North Korea'),
  ('KR', 'Korea'),
  ('KW', 'Kuwait'),
  ('KY', 'Cayman Islands'),
  ('KZ', 'Kazakhstan'),
  ('LA', 'Laos'),
  ('LB', 'Lebanon'),
  ('LC', 'St. Lucia'),
  ('LI', 'Liechtenstein'),
  ('LK', 'Sri Lanka'),
  ('LR', 'Liberia'),
  ('LS', 'Lesotho'),
  ('LT', 'Lithuania'),
  ('LU', 'Luxembourg'),
  ('LV', 'Latvia'),
  ('LY', 'Libya'),
  ('MA', 'Morocco'),
  ('MC', 'Monaco'),
  ('MD', 'Moldova'),
  ('ME', 'Montenegro'),
  ('MF', 'St. Martin'),
  ('MG', 'Madagascar'),
  ('MH', 'Marshall Islands'),
  ('MK', 'North Macedonia'),
  ('ML', 'Mali'),
  ('MM', 'Myanmar'),
  ('MN', 'Mongolia'),
  ('MO', 'Macao SAR'),
  ('MP', 'Northern Mariana Islands'),
  ('MQ', 'Martinique'),
  ('MR', 'Mauritania'),
  ('MS', 'Montserrat'),
  ('MT', 'Malta'),
  ('MU', 'Mauritius'),
  ('MV', 'Maldives'),
  ('MW', 'Malawi'),
  ('MX', 'Mexico'),
  ('MY', 'Malaysia'),
  ('MZ', 'Mozambique'),
  ('NA', 'Namibia'),
  ('NC', 'New Caledonia'),
  ('NE', 'Niger'),
  ('NF', 'Norfolk Island'),
  ('NG', 'Nigeria'),
  ('NI', 'Nicaragua'),
  ('NL', 'Netherlands'),
  ('NO', 'Norway'),
  ('NP', 'Nepal'),
  ('NR', 'Nauru'),
  ('NU', 'Niue'),
  ('NZ', 'New Zealand'),
  ('OM', 'Oman'),
  ('PA', 'Panama'),
  ('PE', 'Peru'),
  ('PF', 'French Polynesia'),
  ('PG', 'Papua New Guinea'),
  ('PH', 'Philippines'),
  ('PK', 'Pakistan'),
  ('PL', 'Poland'),
  ('PM', 'St. Pierre & Miquelon'),
  ('PN', 'Pitcairn Islands'),
  ('PR', 'Puerto Rico'),
  ('PS', 'Palestinian Authority'),
  ('PT', 'Portugal'),
  ('PW', 'Palau'),
  ('PY', 'Paraguay'),
  ('QA', 'Qatar'),
  ('RE', 'Reunion'),
  ('RO', 'Romania'),
  ('RS', 'Serbia'),
  ('RU', 'Russia'),
  ('RW', 'Rwanda'),
  ('SA', 'Saudi Arabia'),
  ('SB', 'Solomon Islands'),
  ('SC', 'Seychelles'),
  ('SD', 'Sudan'),
  ('SE', 'Sweden'),
  ('SG', 'Singapore'),
  ('SH', 'St Helena, Ascension, Tristan da Cunha'),
  ('SI', 'Slovenia'),
  ('SJ', 'Svalbard & Jan Mayen'),
  ('SK', 'Slovakia'),
  ('SL', 'Sierra Leone'),
  ('SM', 'San Marino'),
  ('SN', 'Senegal'),
  ('SO', 'Somalia'),
  ('SR', 'Suriname'),
  ('SS', 'South Sudan'),
  ('ST', 'Sao Tome & Principe'),
  ('SV', 'El Salvador'),
  ('SX', 'Sint Maarten'),
  ('SY', 'Syria'),
  ('SZ', 'Eswatini'),
  ('TC', 'Turks & Caicos Islands'),
  ('TD', 'Chad'),
  ('TG', 'Togo'),
  ('TH', 'Thailand'),
  ('TJ', 'Tajikistan'),
  ('TK', 'Tokelau'),
  ('TL', 'Timor-Leste'),
  ('TM', 'Turkmenistan'),
  ('TN', 'Tunisia'),
  ('TO', 'Tonga'),
  ('TR', 'Turkiye'),
  ('TT', 'Trinidad & Tobago'),
  ('TV', 'Tuvalu'),
  ('TW', 'Taiwan'),
  ('TZ', 'Tanzania'),
  ('UA', 'Ukraine'),
  ('UG', 'Uganda'),
  ('UM', 'U.S. Outlying Islands'),
  ('US', 'United States'),
  ('UY', 'Uruguay'),
  ('UZ', 'Uzbekistan'),
  ('VA', 'Vatican City'),
  ('VC', 'St. Vincent & Grenadines'),
  ('VE', 'Venezuela'),
  ('VG', 'British Virgin Islands'),
  ('VI', 'U.S. Virgin Islands'),
  ('VN', 'Vietnam'),
  ('VU', 'Vanuatu'),
  ('WF', 'Wallis & Futuna'),
  ('WS', 'Samoa'),
  ('XK', 'Kosovo'),
  ('YE', 'Yemen'),
  ('YT', 'Mayotte'),
  ('ZA', 'South Africa'),
  ('ZM', 'Zambia'),
  ('ZW', 'Zimbabwe')
on conflict (country_code) do update
  set country_name = excluded.country_name,
      is_active = true,
      updated_at = now();

-- ── Legacy flat requirement list ────────────────────────────────────────────
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

-- ── Application settings and document categories ────────────────────────────
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

-- ── FSVP Standard rule set, published version 1 ─────────────────────────────
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
  -- Explicit target: without the unique constraint on set_name this raises
  -- rather than silently inserting a second 'FSVP Standard' (see
  -- upgrade/048_dedupe_rule_sets.sql for the database that happened to).
  on conflict (set_name) do nothing
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
    -- ON CONFLICT cannot be used here: validate_scoring_weights() is a BEFORE
    -- INSERT trigger, so it fires before conflict resolution and would see
    -- "existing 100% + adding N%" on any re-run. Check first instead.
    if not exists (
      select 1 from scoring_category_weights
      where rule_version_id = v_version_id and section_id = v_section_id
    ) then
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
    );
    end if;
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
    -- ON CONFLICT cannot be used here: validate_scoring_weights() is a BEFORE
    -- INSERT trigger, so it fires before conflict resolution and would see
    -- "existing 100% + adding N%" on any re-run. Check first instead.
    if not exists (
      select 1 from scoring_category_weights
      where rule_version_id = v_version_id and section_id = v_section_id
    ) then
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
    );
    end if;
  end loop;

end $$;

-- ── Supplier-level sections, weights and items ──────────────────────────────
do $$
declare
  v_version_id   uuid;
  v_section_id   uuid;
  v_section_key  text;
begin
  -- Resolve the published version id
  select rv.id into v_version_id
  from rule_versions rv
  join rule_sets rs on rs.id = rv.rule_set_id
  where rs.set_name = 'FSVP Standard'
    and rv.status   = 'published'
  order by rv.version_number desc
  limit 1;

  if v_version_id is null then
    raise exception 'No published FSVP Standard rule version found. Run migration 021 first.';
  end if;

  -- --------------------------------------------------------
  -- Supplier sections
  -- --------------------------------------------------------
  insert into requirement_sections (rule_version_id, section_key, section_name, applies_to, sort_order)
  values
    (v_version_id, 'supplier_legal_entity',         'Legal Entity and Ownership',                  'supplier', 10),
    (v_version_id, 'supplier_contacts',             'Primary Contacts',                            'supplier', 20),
    (v_version_id, 'supplier_questionnaire',        'Supplier Questionnaire',                      'supplier', 30),
    (v_version_id, 'supplier_food_safety_policy',   'Corporate Food Safety Policy',                'supplier', 40),
    (v_version_id, 'supplier_recall_traceability',  'Recall and Traceability Programs',            'supplier', 50),
    (v_version_id, 'supplier_importer_assurances',  'Importer Relationship and Written Assurances','supplier', 60)
  on conflict (rule_version_id, section_key) do nothing;

  -- --------------------------------------------------------
  -- Supplier scoring weights (must total 100%)
  -- --------------------------------------------------------
  for v_section_id, v_section_key in
    select s.id, s.section_key
    from requirement_sections s
    where s.rule_version_id = v_version_id
      and s.applies_to      = 'supplier'
  loop
    -- ON CONFLICT cannot be used here: validate_scoring_weights() is a BEFORE
    -- INSERT trigger, so it fires before conflict resolution and would see
    -- "existing 100% + adding N%" on any re-run. Check first instead.
    if not exists (
      select 1 from scoring_category_weights
      where rule_version_id = v_version_id and section_id = v_section_id
    ) then
    insert into scoring_category_weights (rule_version_id, section_id, weight_percent)
    values (
      v_version_id,
      v_section_id,
      case v_section_key
        when 'supplier_legal_entity'        then 15
        when 'supplier_contacts'            then 10
        when 'supplier_questionnaire'       then 20
        when 'supplier_food_safety_policy'  then 25
        when 'supplier_recall_traceability' then 20
        when 'supplier_importer_assurances' then 10
        else 0
      end
    );
    end if;
  end loop;

  -- --------------------------------------------------------
  -- Supplier requirement items (one or two per section)
  -- --------------------------------------------------------

  -- Legal Entity and Ownership
  select id into v_section_id
  from requirement_sections
  where rule_version_id = v_version_id and section_key = 'supplier_legal_entity';

  insert into requirement_items
    (section_id, item_key, item_name, description, evidence_type, is_required, is_critical_blocker, sort_order)
  values
    (v_section_id, 'legal_entity_docs',
     'Legal Entity Documentation',
     'Articles of incorporation, business registration, or equivalent proof of legal entity.',
     'document', true, true, 10),
    (v_section_id, 'ownership_structure',
     'Ownership Structure',
     'Organizational chart or disclosure of ownership and controlling parties.',
     'document', true, false, 20)
  on conflict (section_id, item_key) do nothing;

  -- Primary Contacts
  select id into v_section_id
  from requirement_sections
  where rule_version_id = v_version_id and section_key = 'supplier_contacts';

  insert into requirement_items
    (section_id, item_key, item_name, description, evidence_type, is_required, is_critical_blocker, sort_order)
  values
    (v_section_id, 'primary_contact_info',
     'Primary Contact Information',
     'Name, title, phone, and email of the primary food-safety contact.',
     'form', true, false, 10),
    (v_section_id, 'regulatory_contact',
     'Regulatory / Quality Contact',
     'Designated contact for FDA and regulatory correspondence.',
     'document', true, false, 20)
  on conflict (section_id, item_key) do nothing;

  -- Supplier Questionnaire
  select id into v_section_id
  from requirement_sections
  where rule_version_id = v_version_id and section_key = 'supplier_questionnaire';

  insert into requirement_items
    (section_id, item_key, item_name, description, evidence_type, is_required, is_critical_blocker, sort_order)
  values
    (v_section_id, 'completed_questionnaire',
     'Completed Supplier Questionnaire',
     'Fully completed FSVP supplier self-assessment questionnaire.',
     'document', true, true, 10)
  on conflict (section_id, item_key) do nothing;

  -- Corporate Food Safety Policy
  select id into v_section_id
  from requirement_sections
  where rule_version_id = v_version_id and section_key = 'supplier_food_safety_policy';

  insert into requirement_items
    (section_id, item_key, item_name, description, evidence_type, is_required, is_critical_blocker, sort_order)
  values
    (v_section_id, 'food_safety_policy_doc',
     'Corporate Food Safety Policy',
     'Signed and dated corporate food safety policy statement.',
     'document', true, true, 10),
    (v_section_id, 'management_commitment',
     'Management Commitment Statement',
     'Statement of executive-level commitment to food safety.',
     'document', true, false, 20)
  on conflict (section_id, item_key) do nothing;

  -- Recall and Traceability Programs
  select id into v_section_id
  from requirement_sections
  where rule_version_id = v_version_id and section_key = 'supplier_recall_traceability';

  insert into requirement_items
    (section_id, item_key, item_name, description, evidence_type, is_required, is_critical_blocker, sort_order)
  values
    (v_section_id, 'recall_plan',
     'Recall Plan',
     'Written product recall and withdrawal procedure.',
     'document', true, true, 10),
    (v_section_id, 'traceability_program',
     'Traceability Program',
     'Lot traceability and one-up / one-back record-keeping procedure.',
     'document', true, true, 20)
  on conflict (section_id, item_key) do nothing;

  -- Importer Relationship and Written Assurances
  select id into v_section_id
  from requirement_sections
  where rule_version_id = v_version_id and section_key = 'supplier_importer_assurances';

  insert into requirement_items
    (section_id, item_key, item_name, description, evidence_type, is_required, is_critical_blocker, sort_order)
  values
    (v_section_id, 'written_assurances',
     'Written Assurances / Supplier Agreement',
     'Signed written assurances or supplier agreement letter required under 21 CFR 1.506(e)(2).',
     'document', true, true, 10),
    (v_section_id, 'importer_acknowledgement',
     'Importer Acknowledgement',
     'Confirmation that the supplier acknowledges the importer is relying on their controls.',
     'document', true, false, 20)
  on conflict (section_id, item_key) do nothing;

end $$;

-- ── Facility and product requirement items ──────────────────────────────────
do $$
declare
  v_section_id uuid;
  v_version_id uuid;
begin

  select id into v_version_id
  from rule_versions
  where status = 'published'
  order by version_number desc
  limit 1;

  if v_version_id is null then
    raise notice 'No published rule version found — skipping.';
    return;
  end if;

  -- ── facility_registration ─────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'facility_registration';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'fda_facility_registration',  'FDA Food Facility Registration',
       'Current FDA food facility registration number and confirmation. Facilities must renew every two years.',
       true, true, true, '21 CFR 1.230-1.235', 10),
      (v_section_id, 'business_license',            'Business License / Operating Permit',
       'Government-issued license permitting the facility to manufacture or process food products.',
       true, false, true, null, 20),
      (v_section_id, 'foreign_regulatory_approval', 'Foreign Regulatory Approval (if applicable)',
       'Approval or registration from the country of origin food safety authority (e.g. CFIA, EU EC number).',
       false, false, true, null, 30)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── food_safety_mgmt ─────────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'food_safety_mgmt';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'pcqi_certification',       'PCQI Certification',
       'Certificate confirming the Preventive Controls Qualified Individual (PCQI) has completed FSPCA-accredited training.',
       true, true, true, '21 CFR 117.135', 10),
      (v_section_id, 'food_safety_plan',          'Written Food Safety Plan',
       'Current signed food safety plan including hazard analysis, preventive controls, supply-chain program, and recall plan.',
       true, true, false, '21 CFR 117.126', 20),
      (v_section_id, 'management_review_records', 'Management Review Records',
       'Records of periodic management reviews of the food safety plan (at minimum annually).',
       true, false, false, '21 CFR 117.165', 30),
      (v_section_id, 'employee_training_records', 'Employee Training Records',
       'Records showing all personnel handling food have received appropriate hygiene and food safety training.',
       true, false, false, '21 CFR 117.4', 40)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── gmp_sanitation ───────────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'gmp_sanitation';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'gmp_policy',           'GMP Policy and Procedures',
       'Written cGMP policy covering personnel hygiene, plant operations, and equipment maintenance.',
       true, false, false, '21 CFR 117 Subpart B', 10),
      (v_section_id, 'ssop',                 'Sanitation Standard Operating Procedures (SSOPs)',
       'Written SSOPs covering pre-operational and operational sanitation, including food-contact surface cleaning and sanitizing.',
       true, true, false, '21 CFR 117.135(c)(3)', 20),
      (v_section_id, 'pest_control_program', 'Pest Control Program',
       'Documented pest control program including service logs, inspection records, and corrective actions.',
       true, false, false, null, 30),
      (v_section_id, 'cleaning_schedule',    'Cleaning and Sanitizing Schedule',
       'Master cleaning schedule identifying frequency, method, chemical, and responsible party for each area and equipment.',
       true, false, false, null, 40)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── haccp_preventive ─────────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'haccp_preventive';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'haccp_plan',             'HACCP Plan or Preventive Controls Plan',
       'Current signed HACCP plan or FSMA Preventive Controls plan covering all hazards for products made at this facility.',
       true, true, false, '21 CFR 117.126 / Codex HACCP', 10),
      (v_section_id, 'hazard_analysis_doc',    'Hazard Analysis Documentation',
       'Written hazard analysis identifying biological, chemical, and physical hazards and their likelihood and severity.',
       true, true, false, '21 CFR 117.130', 20),
      (v_section_id, 'ccp_monitoring_records', 'CCP / Process Control Monitoring Records',
       'Sample monitoring records demonstrating critical control points are monitored at the required frequency.',
       true, false, false, '21 CFR 117.145', 30),
      (v_section_id, 'validation_records',     'Validation Records',
       'Scientific or technical evidence validating preventive controls are effective at controlling identified hazards.',
       true, false, false, '21 CFR 117.160', 40)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── traceability_recall ──────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'traceability_recall';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'recall_procedure',    'Recall Procedure',
       'Written recall procedure covering notification, retrieval, segregation, disposition, and FDA reporting steps.',
       true, true, false, '21 CFR 117.139', 10),
      (v_section_id, 'mock_recall_records', 'Mock Recall Records',
       'Records from the most recent mock recall exercise demonstrating ability to trace product within 2 hours.',
       true, false, false, null, 20),
      (v_section_id, 'lot_traceability',    'Lot Traceability Records',
       'Sample records showing one-up/one-down traceability by lot code including incoming ingredient lots and finished product distribution.',
       true, false, false, '21 CFR 1.1310-1.1455', 30)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── testing_lab ──────────────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'testing_lab';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'lab_accreditation',   'Laboratory Accreditation / Certification',
       'ISO 17025 accreditation certificate or equivalent for the laboratory performing product and environmental testing.',
       true, false, true, null, 10),
      (v_section_id, 'testing_protocol',    'Testing Protocol / Sampling Plan',
       'Written testing program defining what is tested, at what frequency, by which method, and acceptable limits.',
       true, false, false, null, 20),
      (v_section_id, 'recent_test_results', 'Recent Test Results (within 12 months)',
       'Analytical test results from the past 12 months covering relevant pathogens, chemical contaminants, or other hazards.',
       true, false, true, null, 30)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── audit_history ────────────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'audit_history';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'third_party_audit_report', 'Most Recent Third-Party Audit Report',
       'Full report from the most recent third-party food safety audit (e.g. SQF, BRC, FSSC 22000, AIB).',
       true, false, true, null, 10),
      (v_section_id, 'audit_certificate',        'Audit Certificate / Certification Letter',
       'Current certificate from the certifying body confirming the facility certification status and grade.',
       false, false, true, null, 20),
      (v_section_id, 'audit_capa_response',      'Corrective Action Responses to Prior Audit Findings',
       'Documentation of closed corrective actions addressing non-conformances from the prior audit report.',
       true, false, false, null, 30)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── corrective_action_mgmt ───────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'corrective_action_mgmt';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'capa_procedure', 'CAPA Procedure',
       'Written CAPA procedure defining how deviations are identified, investigated, resolved, and verified.',
       true, false, false, '21 CFR 117.150', 10),
      (v_section_id, 'open_capa_log',  'Open CAPA Log',
       'Current log of open corrective actions with issue description, root cause, assigned owner, and target closure date.',
       true, false, false, null, 20)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── product_hazard_analysis ──────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'product_hazard_analysis';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'product_hazard_analysis_doc',     'Product Hazard Analysis',
       'Written hazard analysis specific to this product identifying all known or reasonably foreseeable biological, chemical, and physical hazards.',
       true, true, false, '21 CFR 117.130', 10),
      (v_section_id, 'known_or_reasonably_foreseeable', 'Known / Reasonably Foreseeable Hazard List',
       'List of hazards evaluated and the rationale for those requiring a preventive control versus those that do not.',
       true, false, false, '21 CFR 117.130(a)', 20)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── product_testing ──────────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'product_testing';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'finished_product_test_results', 'Finished Product Test Results',
       'Analytical test results for this product from the past 12 months covering relevant pathogens or contaminants.',
       true, true, true, null, 10),
      (v_section_id, 'product_testing_frequency',     'Product Testing Frequency / Schedule',
       'Written schedule defining how often this product is tested and which parameters are measured.',
       true, false, false, null, 20)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── product_specifications ───────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'product_specifications';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'product_spec_sheet',   'Product Specification Sheet',
       'Current finished product spec including ingredients, physical/chemical parameters, microbiological limits, and shelf life.',
       true, true, false, null, 10),
      (v_section_id, 'ingredient_statement', 'Ingredient / Bill of Materials Statement',
       'Full ingredient list with supplier sources and any allergen declarations.',
       true, false, false, '21 CFR 101.4', 20)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── coa_program ──────────────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'coa_program';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'sample_coa',    'Sample Certificate of Analysis',
       'Representative COA for a recent lot of this product showing all tested parameters and results.',
       true, false, false, null, 10),
      (v_section_id, 'coa_procedure', 'COA Issuance Procedure',
       'Written procedure describing how COAs are generated, reviewed, approved, and transmitted to customers.',
       true, false, false, null, 20)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── labeling_allergen ────────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'labeling_allergen';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'product_label',         'Current Product Label',
       'Approved label artwork for the US market showing net weight, ingredient list, and allergen declaration.',
       true, true, false, '21 CFR 101 / FALCPA', 10),
      (v_section_id, 'allergen_control_plan', 'Allergen Control Plan',
       'Written allergen control program covering scheduling, changeovers, cleaning validation, and label verification.',
       true, true, false, '21 CFR 117.135(c)(2)', 20)
    on conflict (section_id, item_key) do nothing;
  end if;

  -- ── nonconformances ──────────────────────────────────────────
  select id into v_section_id from requirement_sections
  where rule_version_id = v_version_id and section_key = 'nonconformances';
  if v_section_id is not null then
    insert into requirement_items (section_id, item_key, item_name, description, is_required, is_critical_blocker, expiration_applies, cfr_citation, sort_order)
    values
      (v_section_id, 'nonconformance_log',        'Non-Conformance / Complaint Log (12 months)',
       'Log of product non-conformances and customer complaints for this product over the past 12 months.',
       true, false, true, null, 10),
      (v_section_id, 'nonconformance_resolution', 'Non-Conformance Resolution Records',
       'Evidence that non-conformances were investigated, root-caused, and corrective actions implemented.',
       true, false, false, null, 20)
    on conflict (section_id, item_key) do nothing;
  end if;

end $$;

commit;
