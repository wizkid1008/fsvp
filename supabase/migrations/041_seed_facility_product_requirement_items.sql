-- 041: Seed requirement_items for facility and product sections

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
