-- 017_auto_link_importer.sql
-- Automatically link importer_id on profiles for importer/reviewer/admin roles.
-- When a profile has no importer_id and their role is not 'supplier',
-- this trigger assigns the first (platform) importer record automatically.

create or replace function public.auto_link_importer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_importer_id uuid;
begin
  -- Only act on us_importer, reviewer, and administrator roles
  if new.role not in ('us_importer', 'reviewer', 'administrator') then
    return new;
  end if;

  -- Already has an importer_id — nothing to do
  if new.importer_id is not null then
    return new;
  end if;

  -- Find the platform importer (first record by created_at)
  select id into platform_importer_id
  from importers
  order by created_at
  limit 1;

  if platform_importer_id is not null then
    new.importer_id := platform_importer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_auto_link_importer on profiles;
create trigger trg_profiles_auto_link_importer
  before insert or update of role, importer_id
  on profiles
  for each row
  execute function public.auto_link_importer();

-- Backfill: link any existing profiles that are missing an importer_id
do $$
declare
  platform_importer_id uuid;
begin
  select id into platform_importer_id from importers order by created_at limit 1;

  if platform_importer_id is not null then
    alter table public.profiles disable trigger trg_profiles_prevent_role_escalation;

    update public.profiles
    set importer_id = platform_importer_id
    where importer_id is null
      and role::text in ('us_importer', 'reviewer', 'administrator');

    alter table public.profiles enable trigger trg_profiles_prevent_role_escalation;
  end if;
end $$;
