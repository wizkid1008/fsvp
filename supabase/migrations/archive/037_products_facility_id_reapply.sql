-- 037_products_facility_id_reapply.sql — re-apply 019_product_facility_link.sql's column add.
-- "Could not find the 'facility_id' column of 'products_verify' in the schema cache" means
-- migration 019 never actually ran against this database. This is idempotent and safe to
-- run even if 019 did run.

alter table products_verify
  add column if not exists facility_id uuid references facilities_verify(id) on delete set null;

create index if not exists ix_products_verify_facility
  on products_verify (facility_id)
  where facility_id is not null;

-- Force PostgREST to pick up the new column immediately instead of waiting for its
-- periodic schema cache refresh.
notify pgrst, 'reload schema';
