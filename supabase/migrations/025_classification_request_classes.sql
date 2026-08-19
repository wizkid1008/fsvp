-- Capture enough detail on "none of these fit" submissions without making
-- free-text suggestions part of the live commodity taxonomy.

alter table commodity_classification_requests
  add column if not exists commodity_class text
    check (commodity_class in (
      'fruit', 'vegetable', 'nut', 'grain', 'herb_spice',
      'seafood', 'meat_poultry', 'dairy', 'egg',
      'beverage', 'processed_food', 'supplement', 'other'
    ));

comment on column commodity_classification_requests.commodity_class is
  'The broad commodity class the importer selected when no curated commodity fit.';
