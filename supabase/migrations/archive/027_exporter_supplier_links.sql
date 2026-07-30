-- ============================================================
-- 027: Exporter ↔ Supplier relationship model
--
-- Adds supplier_type to suppliers so entities can identify
-- whether they are an exporter/trader, manufacturer, or both.
--
-- Creates exporter_supplier_links junction table so an exporter
-- can invite and link upstream suppliers. Either party can then
-- upload and manage facilities/products for the shared chain.
--
-- Two-way visibility: exporters see their suppliers' data;
-- suppliers see the exporters they supply to.
-- ============================================================

-- ── 1. supplier_type on suppliers ────────────────────────────

alter table suppliers
  add column if not exists supplier_type text not null default 'exporter'
    check (supplier_type in ('exporter', 'manufacturer', 'trader', 'broker', 'exporter_manufacturer'));

-- Back-fill: any supplier already linked to importers is an exporter
update suppliers
set supplier_type = 'exporter'
where id in (select distinct supplier_id from importer_supplier_links)
  and supplier_type = 'exporter'; -- no-op but explicit

-- ── 2. exporter_supplier_links table ─────────────────────────

create table if not exists exporter_supplier_links (
  id                    uuid primary key default gen_random_uuid(),
  exporter_id           uuid not null references suppliers(id) on delete cascade,
  supplier_id           uuid not null references suppliers(id) on delete cascade,
  -- status lifecycle: pending_invite → active; or → declined / terminated
  status                text not null default 'pending_invite'
    check (status in ('pending_invite', 'active', 'declined', 'terminated')),
  -- invite tracking
  invite_email          text,          -- email the invite was sent to
  invite_token          text unique,   -- random token in the invite link
  invite_sent_at        timestamptz,
  accepted_at           timestamptz,
  declined_at           timestamptz,
  -- who created this link
  invited_by_profile_id uuid references profiles(id) on delete set null,
  notes                 text,          -- optional relationship notes
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- prevent duplicate links between same pair
  unique (exporter_id, supplier_id),
  -- an entity cannot link to itself
  check (exporter_id <> supplier_id)
);

create index if not exists ix_esl_exporter on exporter_supplier_links (exporter_id);
create index if not exists ix_esl_supplier on exporter_supplier_links (supplier_id);
create index if not exists ix_esl_token    on exporter_supplier_links (invite_token) where invite_token is not null;
create index if not exists ix_esl_status   on exporter_supplier_links (status);

-- ── 3. updated_at trigger ─────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_exporter_supplier_links_updated_at'
  ) then
    execute '
      create trigger trg_exporter_supplier_links_updated_at
        before update on exporter_supplier_links
        for each row execute function set_updated_at()';
  end if;
end $$;

-- ── 4. RLS ────────────────────────────────────────────────────

alter table exporter_supplier_links enable row level security;

drop policy if exists esl_read   on exporter_supplier_links;
drop policy if exists esl_insert on exporter_supplier_links;
drop policy if exists esl_update on exporter_supplier_links;
drop policy if exists esl_delete on exporter_supplier_links;

-- Exporters can see all links where they are the exporter
-- Suppliers can see all links where they are the supplier
-- Admins see everything
create policy esl_read on exporter_supplier_links
  for select using (
    public.is_platform_admin()
    or exporter_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
  );

-- Only the exporter side (or admin) can create links
create policy esl_insert on exporter_supplier_links
  for insert with check (
    public.is_platform_admin()
    or exporter_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
  );

-- Either party can update (e.g. supplier accepts/declines)
create policy esl_update on exporter_supplier_links
  for update using (
    public.is_platform_admin()
    or exporter_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
  );

-- Only exporter or admin can delete
create policy esl_delete on exporter_supplier_links
  for delete using (
    public.is_platform_admin()
    or exporter_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
  );

-- ── 5. Extend supplier visibility via links ───────────────────
-- Linked suppliers should be able to see each other's suppliers row.
-- The existing suppliers RLS in migration 021 allows read if:
--   supplier_id in (select supplier_id from profiles where id = auth.uid())
-- We extend it so linked parties can also read each other's rows.

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
      select supplier_id from importer_supplier_links
      where importer_id in (
        select importer_id from profiles
        where id = auth.uid() and importer_id is not null
      )
    )
    -- exporter sees their upstream suppliers
    or id in (
      select supplier_id from exporter_supplier_links
      where exporter_id in (
        select supplier_id from profiles
        where id = auth.uid() and supplier_id is not null
      )
      and status = 'active'
    )
    -- supplier sees the exporters they supply to
    or id in (
      select exporter_id from exporter_supplier_links
      where supplier_id in (
        select supplier_id from profiles
        where id = auth.uid() and supplier_id is not null
      )
      and status = 'active'
    )
  );

-- ── 6. Extend facilities + products visibility via links ──────
-- Allow linked exporters to see/add facilities for their suppliers
-- (and vice versa). We add a helper function for link membership.

create or replace function public.is_linked_supplier(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from exporter_supplier_links
    where status = 'active'
      and (
        -- I am the exporter, checking one of my suppliers
        (exporter_id in (select supplier_id from profiles where id = auth.uid() and supplier_id is not null)
         and supplier_id = p_supplier_id)
        or
        -- I am the supplier, checking one of my exporters
        (supplier_id in (select supplier_id from profiles where id = auth.uid() and supplier_id is not null)
         and exporter_id = p_supplier_id)
      )
  );
$$;
