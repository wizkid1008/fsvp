-- 040_restrict_signup_role_metadata.sql — prevent self-registration as reviewer/administrator
-- handle_new_user() previously cast raw_user_meta_data->>'role' directly to app_role with no
-- allowlist, so anyone calling supabase.auth.signUp() directly (bypassing the app's signup UI,
-- which only ever sends 'supplier' or 'us_importer') could self-assign 'administrator' or
-- 'reviewer'. Now only 'supplier' and 'us_importer' are honored from signup metadata; anything
-- else (or missing) falls back to 'supplier'. Reviewer/administrator accounts must be assigned
-- by an existing administrator via the admin user-management screen.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data->>'role';
  safe_role app_role;
begin
  safe_role := case
    when requested_role in ('supplier', 'us_importer') then requested_role::app_role
    else 'supplier'::app_role
  end;

  insert into public.profiles (id, email, full_name, role, user_status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    safe_role,
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
