-- ============================================================================
-- 030_management_commitment_form.sql — answer the Management Commitment
-- Statement online
--
-- The item asked every exporter to write and upload a letter that says much the
-- same thing each time. It is now a form: the commitments are stated for the
-- signatory to tick, and they sign with name, title and date. Submitting it
-- files a documents row exactly as 006 describes, so scoring, the review queue
-- and the inspection package are unchanged.
--
-- The upload stays available alongside the form (RequirementItemRow and
-- CorporateScopeUploadTile both offer it for form items), because some
-- importers and auditors will still want a letter on letterhead with a wet
-- signature. Either one satisfies the item; the reviewer decides.
--
-- Each commitment is a required checkbox rather than a paragraph of prose, so
-- the rendered response records that each one was affirmed individually, and a
-- reviewer reads them as answers rather than as boilerplate.
-- ============================================================================

begin;

do $$
declare
  v_version_id uuid;
  v_item_id    uuid;
begin
  select id into v_version_id
  from rule_versions
  where status = 'published'
  order by version_number desc
  limit 1;

  if v_version_id is null then
    raise exception 'No published rule version. Apply 002_reference_data.sql first.';
  end if;

  select ri.id into v_item_id
  from requirement_items ri
  join requirement_sections rs on rs.id = ri.section_id
  where rs.rule_version_id = v_version_id
    and rs.section_key = 'supplier_food_safety_policy'
    and ri.item_key = 'management_commitment';

  if v_item_id is null then
    raise exception 'Management commitment requirement item is missing. Apply 002_reference_data.sql first.';
  end if;

  -- Same reasoning as 007: this records how an unchanged requirement is
  -- collected, not an authoring change to it. Wording, criticality and weight
  -- are untouched.
  alter table requirement_items disable trigger trg_requirement_items_published_guard;

  update requirement_items
  set evidence_type = 'form'
  where id = v_item_id;

  alter table requirement_items enable trigger trg_requirement_items_published_guard;

  insert into form_definitions
    (rule_version_id, requirement_item_id, form_key, title, description, schema_json, sort_order)
  values (
    v_version_id, v_item_id, 'supplier_management_commitment',
    'Management Commitment Statement',
    'To be completed by a senior executive of the exporting company — an owner, director, general manager or equivalent — with authority to commit its resources. Your importer reviews this statement as part of their FSVP record under 21 CFR Part 1 Subpart L.',
    $json$
    {
      "sections": [
        {
          "key": "commitments",
          "title": "Statement of Commitment",
          "description": "On behalf of the company named on this statement, senior management commits to the production and supply of safe food, and specifically to each of the following.",
          "fields": [
            { "key": "commit_priority",    "type": "checkbox", "label": "Food safety is a business priority, and decisions affecting it are not subordinated to cost or schedule.", "required": true },
            { "key": "commit_resources",   "type": "checkbox", "label": "We provide the people, training, facilities and equipment needed to maintain our food safety system.", "required": true },
            { "key": "commit_compliance",  "type": "checkbox", "label": "Food we export to the United States is produced in compliance with applicable FDA requirements, including 21 CFR Part 117 or Part 112 where they apply.", "required": true },
            { "key": "commit_system",      "type": "checkbox", "label": "We maintain a documented food safety plan, and review and update it at least annually or when processes, products or hazards change.", "required": true },
            { "key": "commit_notify",      "type": "checkbox", "label": "We will notify our importers promptly of any food safety incident, regulatory action, recall or significant change affecting the food we supply to them.", "required": true },
            { "key": "commit_records",     "type": "checkbox", "label": "We will make relevant records available to our importers and to FDA on request.", "required": true },
            { "key": "commit_improvement", "type": "checkbox", "label": "We act on audit findings, complaints and corrective actions to improve our food safety performance.", "required": true }
          ]
        },
        {
          "key": "signatory",
          "title": "Signed on Behalf of Senior Management",
          "description": "Typing your name below is your signature to this statement.",
          "fields": [
            { "key": "authority_confirmed", "type": "checkbox", "label": "I am a member of senior management with authority to make this commitment on the company's behalf.", "required": true },
            { "key": "signatory_name",      "type": "text", "label": "Full name", "required": true },
            { "key": "signatory_title",     "type": "text", "label": "Job title", "required": true, "placeholder": "e.g. Managing Director" },
            { "key": "signed_date",         "type": "date", "label": "Date", "required": true }
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
