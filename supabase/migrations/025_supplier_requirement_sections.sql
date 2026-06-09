-- ============================================================
-- 025: Seed supplier-level requirement sections, weights, and
--      items into the existing published FSVP Standard v1.
--
-- The guard trigger only blocks UPDATE on published versions,
-- so inserts are safe. All inserts use ON CONFLICT DO NOTHING
-- so re-running this migration is idempotent.
-- ============================================================

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
    )
    on conflict (rule_version_id, section_id) do nothing;
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
