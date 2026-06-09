-- ============================================================
-- 026: Auto-create and link supplier records for profiles with
--      role = 'supplier' that have no supplier_id set.
--
-- Root cause: profiles.supplier_id can be null for supplier-role
-- users when no suppliers row was created at account setup time.
-- This migration back-fills existing gaps and adds a trigger so
-- every new supplier-role profile gets a suppliers row on insert.
-- ============================================================

-- ── 1. Ensure profiles.supplier_id references suppliers(id) ──
-- Migration 013 created this column referencing foreign_suppliers.
-- Migration 023 used ADD COLUMN IF NOT EXISTS so the old FK may
-- still be in place. We drop the old constraint (if it exists) and
-- re-add pointing at suppliers(id).

do $$
begin
  -- Drop old FK referencing foreign_suppliers if it exists
  if exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
    join information_schema.referential_constraints rc
      on tc.constraint_name = rc.constraint_name
    join information_schema.table_constraints tc2
      on rc.unique_constraint_name = tc2.constraint_name
    where tc.table_name          = 'profiles'
      and kcu.column_name        = 'supplier_id'
      and tc.constraint_type     = 'FOREIGN KEY'
      and tc2.table_name         = 'foreign_suppliers'
  ) then
    alter table profiles
      drop constraint if exists profiles_supplier_id_fkey;
  end if;
end $$;

-- Add correct FK to suppliers (if not already pointing there)
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
    join information_schema.referential_constraints rc
      on tc.constraint_name = rc.constraint_name
    join information_schema.table_constraints tc2
      on rc.unique_constraint_name = tc2.constraint_name
    where tc.table_name      = 'profiles'
      and kcu.column_name    = 'supplier_id'
      and tc.constraint_type = 'FOREIGN KEY'
      and tc2.table_name     = 'suppliers'
  ) then
    -- Add the column if it truly doesn't exist yet, otherwise just add FK
    alter table profiles
      add column if not exists supplier_id uuid;

    alter table profiles
      add constraint profiles_supplier_id_fkey
      foreign key (supplier_id) references suppliers(id) on delete set null;
  end if;
end $$;

-- ── 2. Function: create + link a suppliers row for a profile ─

create or replace function public.ensure_supplier_record_for_profile(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_org_name    text;
  v_full_name   text;
  v_email       text;
  v_country     text;
begin
  -- Already linked — nothing to do
  select supplier_id into v_supplier_id
  from profiles where id = p_profile_id;

  if v_supplier_id is not null then
    return v_supplier_id;
  end if;

  -- Gather profile data
  select organization_name, full_name, email, country
  into v_org_name, v_full_name, v_email, v_country
  from profiles where id = p_profile_id;

  -- Try to find an existing suppliers row by company name first
  if v_org_name is not null then
    select id into v_supplier_id
    from suppliers
    where lower(company_name) = lower(v_org_name)
    limit 1;
  end if;

  -- Create a new suppliers row if no match found
  if v_supplier_id is null then
    insert into suppliers (
      company_name,
      legal_entity_name,
      country,
      primary_contact_name,
      primary_contact_email,
      status
    ) values (
      coalesce(v_org_name, v_full_name, 'Unnamed Exporter'),
      v_org_name,
      v_country,
      v_full_name,
      v_email,
      'pending'
    )
    returning id into v_supplier_id;
  end if;

  -- Link the profile
  update profiles
  set supplier_id = v_supplier_id
  where id = p_profile_id;

  return v_supplier_id;
end $$;

-- ── 3. Back-fill existing supplier-role profiles with no link ─

do $$
declare
  p record;
begin
  for p in
    select id
    from profiles
    where role = 'supplier'
      and supplier_id is null
  loop
    perform public.ensure_supplier_record_for_profile(p.id);
  end loop;
end $$;

-- ── 4. Trigger: auto-link on every new supplier-role profile ─

create or replace function public.trg_auto_link_supplier_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'supplier' and new.supplier_id is null then
    new.supplier_id := public.ensure_supplier_record_for_profile(new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_link_supplier_profile on profiles;
create trigger trg_auto_link_supplier_profile
  after insert on profiles
  for each row execute function public.trg_auto_link_supplier_profile();
