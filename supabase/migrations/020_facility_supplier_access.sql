-- 020_facility_supplier_access.sql - allow facilities to be shared across suppliers

create table if not exists facility_supplier_access (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities_verify(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  importer_id uuid references importers(id) on delete cascade,
  access_level text not null default 'manage' check (access_level in ('view', 'manage')),
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (facility_id, supplier_id)
);

create index if not exists ix_facility_supplier_access_facility
  on facility_supplier_access (facility_id);

create index if not exists ix_facility_supplier_access_supplier
  on facility_supplier_access (supplier_id);

insert into facility_supplier_access (facility_id, supplier_id, importer_id, access_level)
select id, supplier_id, importer_id, 'manage'
from facilities_verify
where supplier_id is not null
on conflict (facility_id, supplier_id) do nothing;

alter table facility_supplier_access enable row level security;

drop policy if exists facility_supplier_access_read on facility_supplier_access;
create policy facility_supplier_access_read on facility_supplier_access
  for select to authenticated
  using (
    public.is_platform_admin()
    or (
      importer_id in (select public.current_importer_ids())
      and exists (
        select 1 from profiles
        where id = auth.uid()
          and role::text in ('us_importer', 'reviewer', 'administrator')
      )
    )
    or supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  );

drop policy if exists facility_supplier_access_write on facility_supplier_access;
create policy facility_supplier_access_write on facility_supplier_access
  for all to authenticated
  using (
    public.is_platform_admin()
    or (
      importer_id in (select public.current_importer_ids())
      and exists (
        select 1 from profiles
        where id = auth.uid()
          and role::text in ('us_importer', 'reviewer', 'administrator')
      )
    )
    or supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  )
  with check (
    public.is_platform_admin()
    or (
      importer_id in (select public.current_importer_ids())
      and exists (
        select 1 from profiles
        where id = auth.uid()
          and role::text in ('us_importer', 'reviewer', 'administrator')
      )
    )
    or supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
  );

drop policy if exists facilities_verify_tenant_read on facilities_verify;
drop policy if exists facilities_verify_tenant_write on facilities_verify;
create policy facilities_verify_access_read on facilities_verify
  for select to authenticated
  using (
    public.is_platform_admin()
    or (
      importer_id in (select public.current_importer_ids())
      and exists (
        select 1 from profiles
        where id = auth.uid()
          and role::text in ('us_importer', 'reviewer', 'administrator')
      )
    )
    or supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
    or exists (
      select 1
      from facility_supplier_access access
      join profiles profile on profile.supplier_id = access.supplier_id
      where access.facility_id = facilities_verify.id
        and profile.id = auth.uid()
    )
  );

drop policy if exists facilities_supplier_profile_write on facilities_verify;
create policy facilities_supplier_profile_write on facilities_verify
  for all to authenticated
  using (
    public.is_platform_admin()
    or (
      importer_id in (select public.current_importer_ids())
      and exists (
        select 1 from profiles
        where id = auth.uid()
          and role::text in ('us_importer', 'reviewer', 'administrator')
      )
    )
    or supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
    or exists (
      select 1
      from facility_supplier_access access
      join profiles profile on profile.supplier_id = access.supplier_id
      where access.facility_id = facilities_verify.id
        and access.access_level = 'manage'
        and profile.id = auth.uid()
    )
  )
  with check (
    public.is_platform_admin()
    or (
      importer_id in (select public.current_importer_ids())
      and exists (
        select 1 from profiles
        where id = auth.uid()
          and role::text in ('us_importer', 'reviewer', 'administrator')
      )
    )
    or supplier_id in (
      select supplier_id
      from profiles
      where id = auth.uid()
        and supplier_id is not null
    )
    or exists (
      select 1
      from facility_supplier_access access
      join profiles profile on profile.supplier_id = access.supplier_id
      where access.facility_id = facilities_verify.id
        and access.access_level = 'manage'
        and profile.id = auth.uid()
    )
  );

create or replace function public.ensure_product_facility_supplier_match()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.facility_id is not null and new.supplier_id is not null and not exists (
    select 1
    from facility_supplier_access access
    where access.facility_id = new.facility_id
      and access.supplier_id = new.supplier_id
  ) and not exists (
    select 1
    from facilities_verify facility
    where facility.id = new.facility_id
      and facility.supplier_id = new.supplier_id
  ) then
    raise exception 'Product facility must be available to the selected supplier.';
  end if;

  return new;
end;
$$;
