insert into importers (id, legal_name, display_name, food_scope, address_json)
values (
  '00000000-0000-0000-0000-000000000101',
  'Demo Importer LLC',
  'Demo Importer',
  'human',
  '{"line1":"100 Market Street","city":"Philadelphia","state":"PA","country":"US"}'
) on conflict do nothing;

insert into foreign_suppliers (
  id,
  importer_id,
  supplier_name,
  legal_name,
  ffr_registration_number,
  country,
  address_json,
  contact_name,
  contact_email,
  approval_status
) values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  'Pacific Valley Foods',
  'Pacific Valley Foods Ltd.',
  'FFR-123456',
  'Chile',
  '{"line1":"Av. Central 45","city":"Santiago","country":"Chile"}',
  'Maria Alvarez',
  'maria@example.com',
  'pending'
) on conflict do nothing;

insert into supplier_products (
  importer_id,
  supplier_id,
  product_name,
  product_category,
  product_description,
  ingredient_list,
  country_of_origin,
  intended_us_market,
  shelf_life,
  allergen_information
) values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000201',
  'Mango puree',
  'Ingredient',
  'Shelf-stable fruit puree for further processing.',
  'Mango, citric acid',
  'Chile',
  'Food manufacturing',
  '18 months',
  'No major allergens declared'
);

insert into readiness_assessments (
  importer_id,
  supplier_id,
  status,
  overall_score,
  gap_summary,
  recommended_actions
) values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000201',
  'under_review',
  82,
  'Recall preparedness and hazard analysis evidence require reviewer follow-up.',
  'Upload mock recall report, finalize hazard analysis rationale, and renew GMP certificate.'
);
