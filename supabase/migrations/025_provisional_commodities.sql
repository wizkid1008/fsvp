-- Let importers keep moving when the curated commodity list is incomplete.
--
-- A provisional commodity is an active taxonomy row created from an importer
-- "none of these fit" submission. It can support product classification right
-- away, while remaining visibly unreviewed for platform cleanup.

alter table commodities
  add column if not exists review_status text not null default 'verified'
    check (review_status in ('verified', 'provisional', 'archived')),
  add column if not exists created_by_importer_id uuid references importers(id) on delete set null,
  add column if not exists created_by_profile_id uuid references profiles(id) on delete set null,
  add column if not exists provisional_basis text;

create index if not exists ix_commodities_review_status
  on commodities (review_status)
  where active;

alter table commodity_classification_requests
  add column if not exists commodity_class text
    check (commodity_class in (
      'fruit', 'vegetable', 'nut', 'grain', 'herb_spice',
      'seafood', 'meat_poultry', 'dairy', 'egg',
      'beverage', 'processed_food', 'supplement', 'other'
    ));

comment on column commodities.review_status is
  'verified rows are curated reference data; provisional rows were created by an importer because no existing commodity fit.';

comment on column commodities.provisional_basis is
  'Why a provisional commodity was created and what product/request caused it.';

comment on column commodity_classification_requests.commodity_class is
  'The broad commodity class the importer selected when no curated commodity fit.';
