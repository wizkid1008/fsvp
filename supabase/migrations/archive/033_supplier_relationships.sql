-- ============================================================
-- 033: Consolidate importer_supplier_links + exporter_supplier_links
--      into a single supplier_relationships table.
--
-- Motivation: two separate junction tables with near-identical
-- structure, separate RLS policies, and a helper function that
-- referenced only one of them created a confusing, bug-prone model.
-- A single table with a relationship_type discriminator is simpler
-- to query, maintain, and secure.
-- ============================================================

-- ── 1. Create supplier_relationships ─────────────────────────

create table if not exists supplier_relationships (
  id                    uuid primary key default gen_random_uuid(),
  relationship_type     text not null
    check (relationship_type in ('importer_supplier', 'exporter_supplier')),

  -- importer_supplier rows: importer_id set, exporter_id null
  importer_id           uuid references importers(id) on delete cascade,
  -- exporter_supplier rows: exporter_id set, importer_id null
  exporter_id           uuid references suppliers(id) on delete cascade,
  -- downstream supplier — always set
  supplier_id           uuid not null references suppliers(id) on delete cascade,

  -- unified status superset
  status                text not null default 'active'
    check (status in ('pending_invite', 'active', 'paused', 'declined', 'terminated')),

  -- invite fields (exporter_supplier only; null for importer_supplier)
  invite_email          text,
  invite_token          text unique,
  invite_sent_at        timestamptz,
  accepted_at           timestamptz,
  declined_at           timestamptz,

  -- metadata
  linked_by_profile_id  uuid references profiles(id) on delete set null,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- exactly one of importer_id / exporter_id must be set
  check (
    (relationship_type = 'importer_supplier' and importer_id is not null and exporter_id is null)
    or
    (relationship_type = 'exporter_supplier' and exporter_id is not null and importer_id is null)
  ),
  unique (importer_id, supplier_id),
  unique (exporter_id, supplier_id),
  check (exporter_id is null or exporter_id <> supplier_id)
);

create index if not exists ix_sr_importer  on supplier_relationships (importer_id)  where importer_id  is not null;
create index if not exists ix_sr_exporter  on supplier_relationships (exporter_id)  where exporter_id  is not null;
create index if not exists ix_sr_supplier  on supplier_relationships (supplier_id);
create index if not exists ix_sr_type      on supplier_relationships (relationship_type);
create index if not exists ix_sr_status    on supplier_relationships (status);
create index if not exists ix_sr_token     on supplier_relationships (invite_token)  where invite_token is not null;

-- ── 2. updated_at trigger ─────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_supplier_relationships_updated_at'
  ) then
    execute '
      create trigger trg_supplier_relationships_updated_at
        before update on supplier_relationships
        for each row execute function set_updated_at()';
  end if;
end $$;

-- ── 3. Migrate importer_supplier_links ───────────────────────

insert into supplier_relationships (
  relationship_type,
  importer_id,
  supplier_id,
  status,
  linked_by_profile_id,
  created_at
)
select
  'importer_supplier',
  importer_id,
  supplier_id,
  case relationship_status
    when 'active'     then 'active'
    when 'paused'     then 'paused'
    when 'terminated' then 'terminated'
    else 'active'
  end,
  linked_by_profile_id,
  linked_at
from importer_supplier_links
on conflict do nothing;

-- ── 4. Migrate exporter_supplier_links ───────────────────────

insert into supplier_relationships (
  relationship_type,
  exporter_id,
  supplier_id,
  status,
  invite_email,
  invite_token,
  invite_sent_at,
  accepted_at,
  declined_at,
  linked_by_profile_id,
  notes,
  created_at
)
select
  'exporter_supplier',
  exporter_id,
  supplier_id,
  status,
  invite_email,
  invite_token,
  invite_sent_at,
  accepted_at,
  declined_at,
  invited_by_profile_id,
  notes,
  created_at
from exporter_supplier_links
on conflict do nothing;

-- ── 5. RLS ───────────────────────────────────────────────────

alter table supplier_relationships enable row level security;

drop policy if exists sr_read   on supplier_relationships;
drop policy if exists sr_insert on supplier_relationships;
drop policy if exists sr_update on supplier_relationships;
drop policy if exists sr_delete on supplier_relationships;

-- Importers see their importer_supplier rows;
-- exporters/suppliers see their exporter_supplier rows;
-- admins see everything.
create policy sr_read on supplier_relationships
  for select using (
    public.is_platform_admin()
    or importer_id in (
      select importer_id from profiles
      where id = auth.uid() and importer_id is not null
    )
    or exporter_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
  );

-- Importers create importer_supplier rows; exporters create exporter_supplier rows.
create policy sr_insert on supplier_relationships
  for insert with check (
    public.is_platform_admin()
    or (
      relationship_type = 'importer_supplier'
      and importer_id in (
        select importer_id from profiles
        where id = auth.uid() and importer_id is not null
      )
    )
    or (
      relationship_type = 'exporter_supplier'
      and exporter_id in (
        select supplier_id from profiles
        where id = auth.uid() and supplier_id is not null
      )
    )
  );

-- Either party can update (e.g. supplier accepts/declines an invite).
create policy sr_update on supplier_relationships
  for update using (
    public.is_platform_admin()
    or importer_id in (
      select importer_id from profiles
      where id = auth.uid() and importer_id is not null
    )
    or exporter_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
  );

-- Only the "owner" side or admin can delete.
create policy sr_delete on supplier_relationships
  for delete using (
    public.is_platform_admin()
    or importer_id in (
      select importer_id from profiles
      where id = auth.uid() and importer_id is not null
    )
    or exporter_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
  );

-- ── 6. Update is_linked_supplier() helper ────────────────────

create or replace function public.is_linked_supplier(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from supplier_relationships
    where relationship_type = 'exporter_supplier'
      and status = 'active'
      and (
        (exporter_id in (
          select supplier_id from profiles
          where id = auth.uid() and supplier_id is not null
        ) and supplier_id = p_supplier_id)
        or
        (supplier_id in (
          select supplier_id from profiles
          where id = auth.uid() and supplier_id is not null
        ) and exporter_id = p_supplier_id)
      )
  );
$$;

-- ── 7. Update suppliers_read RLS to use supplier_relationships ─

drop policy if exists suppliers_read on suppliers;

create policy suppliers_read on suppliers
  for select using (
    public.is_platform_admin()
    -- own record
    or id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    -- importer sees their linked suppliers
    or id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and importer_id in (
          select importer_id from profiles
          where id = auth.uid() and importer_id is not null
        )
    )
    -- exporter sees their upstream suppliers
    or id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'exporter_supplier'
        and status = 'active'
        and exporter_id in (
          select supplier_id from profiles
          where id = auth.uid() and supplier_id is not null
        )
    )
    -- supplier sees the exporters they supply to
    or id in (
      select exporter_id from supplier_relationships
      where relationship_type = 'exporter_supplier'
        and status = 'active'
        and supplier_id in (
          select supplier_id from profiles
          where id = auth.uid() and supplier_id is not null
        )
    )
  );

-- ── 8. Move export-eligibility trigger to supplier_relationships

drop trigger  if exists trg_validate_exporter_link on importer_supplier_links;
drop trigger  if exists trg_validate_exporter_link on supplier_relationships;

-- Only exporter_supplier rows need the eligibility check —
-- importer_supplier rows link importers to export-eligible suppliers
-- and are already constrained by supplier_type downstream.
create or replace function public.validate_exporter_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.relationship_type = 'importer_supplier'
     and not public.is_export_eligible(new.supplier_id) then
    raise exception
      'Only exporters, traders, or exporter-manufacturers can be linked to importers. '
      'Supplier type (%) is not export-eligible.',
      (select supplier_type from suppliers where id = new.supplier_id);
  end if;
  return new;
end;
$$;

create trigger trg_validate_exporter_link
  before insert or update on supplier_relationships
  for each row execute function public.validate_exporter_link();

-- ── 9. Drop old tables ────────────────────────────────────────

drop table if exists exporter_supplier_links;
drop table if exists importer_supplier_links;
