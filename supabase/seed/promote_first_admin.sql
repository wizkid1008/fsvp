-- Promote the first real Supabase Auth account to platform administrator.
--
-- Usage:
-- 1. Sign up and verify the account in Supabase Auth.
-- 2. Replace the email below.
-- 3. Run this file in the Supabase SQL editor.
--
-- This is intentionally a seed/admin operation, not a migration, because it
-- contains account-specific data.

begin;

do $$
declare
  admin_email text := 'replace-with-your-email@example.com';
  admin_profile_id uuid;
  admin_org_id uuid;
begin
  select id
    into admin_profile_id
  from public.profiles
  where lower(email) = lower(admin_email);

  if admin_profile_id is null then
    raise exception 'No profile exists for %. Sign up and verify the user first.', admin_email;
  end if;

  alter table public.profiles disable trigger trg_profiles_prevent_role_escalation;

  update public.profiles
  set
    role = 'administrator',
    user_status = 'active',
    full_name = nullif(full_name, ''),
    updated_at = now()
  where id = admin_profile_id;

  alter table public.profiles enable trigger trg_profiles_prevent_role_escalation;

  if to_regclass('public.organizations') is not null then
    select id
      into admin_org_id
    from public.organizations
    where organization_name = 'ThrushCross Administration'
      and organization_type = 'administrator'
    order by created_at
    limit 1;

    if admin_org_id is null then
      insert into public.organizations (
        organization_name,
        organization_type,
        country,
        status
      )
      values (
        'ThrushCross Administration',
        'administrator',
        'US',
        'active'
      )
      returning id into admin_org_id;
    end if;
  end if;

  if to_regclass('public.user_roles') is not null and admin_org_id is not null then
    insert into public.user_roles (
      profile_id,
      organization_id,
      role,
      active
    )
    values (
      admin_profile_id,
      admin_org_id,
      'administrator',
      true
    )
    on conflict (profile_id, organization_id, role) do update
      set active = true;
  end if;
end $$;

commit;
