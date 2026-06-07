-- 019_product_facility_link.sql - link products to supplier facilities

alter table products_verify
  add column if not exists facility_id uuid references facilities_verify(id) on delete set null;

create index if not exists ix_products_verify_facility
  on products_verify (facility_id)
  where facility_id is not null;

create or replace function public.ensure_product_facility_supplier_match()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.facility_id is not null and new.supplier_id is not null and not exists (
    select 1
    from facilities_verify facility
    where facility.id = new.facility_id
      and facility.supplier_id = new.supplier_id
  ) then
    raise exception 'Product facility must belong to the selected supplier.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_verify_facility_supplier_match on products_verify;
create trigger trg_products_verify_facility_supplier_match
  before insert or update of supplier_id, facility_id
  on products_verify
  for each row
  execute function public.ensure_product_facility_supplier_match();

drop policy if exists facilities_supplier_profile_write on facilities_verify;
create policy facilities_supplier_profile_write on facilities_verify
  for all to authenticated
  using (
    supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  )
  with check (
    supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  );

drop policy if exists products_supplier_profile_write on products_verify;
create policy products_supplier_profile_write on products_verify
  for all to authenticated
  using (
    supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  )
  with check (
    supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  );

insert into onboarding_steps (
  role, step_key, title, description, cta_label, cta_href, dashboard_label, dashboard_href, completion_key, sort_order
)
values
  ('foreign_supplier', 'profile', 'Complete your profile', 'Add your company name, contact details, and country so your importer can identify you.', 'Go to Account', '/account', 'Complete your profile', '/account', 'profile', 10),
  ('foreign_supplier', 'facility', 'Add your facility', 'Create the manufacturing or storage facility where your products are made or held.', 'Add Facility', '/facilities', 'Add a facility', '/facilities', 'facility', 20),
  ('foreign_supplier', 'product', 'Add your products', 'Create products under the supplier facility that makes or stores them.', 'Add Product', '/products', 'Add a product', '/products', 'product', 30),
  ('foreign_supplier', 'evidence', 'Upload your evidence', 'Upload the documents your importer has requested, including COAs, certifications, and food safety plans.', 'Upload Evidence', '/my-evidence', 'Upload your evidence', '/my-evidence', 'evidence', 40),
  ('foreign_supplier', 'readiness', 'Review your action items', 'Check for corrective actions, revision requests, or additional documents your importer has requested.', 'View Action Items', '/my-requests', 'Review action items', '/my-requests', 'readiness', 50)
on conflict (role, step_key) do update
set
  title = excluded.title,
  description = excluded.description,
  cta_label = excluded.cta_label,
  cta_href = excluded.cta_href,
  dashboard_label = excluded.dashboard_label,
  dashboard_href = excluded.dashboard_href,
  completion_key = excluded.completion_key,
  sort_order = excluded.sort_order,
  active = true;
