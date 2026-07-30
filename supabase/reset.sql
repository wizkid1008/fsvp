-- ============================================================================
-- reset.sql — DESTRUCTIVE. Wipes the entire application database.
--
-- Run this ONLY when you intend to rebuild from 000_baseline.sql. It drops every
-- table, function, trigger and policy in the public schema, clears uploaded
-- files, and deletes all auth users.
--
-- Why it is needed: 000_baseline.sql uses bare `create table` (not
-- `if not exists`), because a baseline should fail loudly rather than silently
-- half-apply onto an existing schema. Applying it to a database that already has
-- migrations 001-044 will error on the first table.
--
-- Safe to run today because the deployment holds no live data. Re-verify that
-- before running it ever again.
-- ============================================================================

-- 1. Drop everything in the public schema.
drop schema public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all   on schema public to postgres, service_role;

-- 2. Storage policies live on storage.objects, which is NOT in the public
--    schema — the cascade above does not touch them. Left in place they would
--    collide with the policy names in 001_baseline_rls.sql.
drop policy if exists supplier_documents_read             on storage.objects;
drop policy if exists supplier_documents_write            on storage.objects;
drop policy if exists supplier_documents_write_supplier_prefix on storage.objects;
drop policy if exists supplier_documents_read_by_supplier on storage.objects;
drop policy if exists background_documents_read           on storage.objects;
drop policy if exists background_documents_admin_write    on storage.objects;

-- 3. Clear uploaded objects. Buckets themselves are recreated idempotently by
--    000_baseline.sql, so they are left alone.
delete from storage.objects
where bucket_id in ('supplier-documents', 'background-documents');

-- 4. Auth users — pick ONE of the two options below.
--
--    Step 1 deleted every profiles row, and handle_new_user() only fires on
--    INSERT to auth.users. So a surviving login would have no profile and would
--    be unable to use the app. Either remove the logins, or rebuild profiles for
--    them after the baseline has been applied.

-- ── Option 4a: start completely fresh (everyone re-registers) ───────────────
-- delete from auth.users;

-- ── Option 4b: KEEP your existing logins ───────────────────────────────────
-- Leave `delete from auth.users` commented out, apply 000/001/002, and THEN run
-- the block below to rebuild a profile for every surviving account.
--
-- Roles come from signup metadata, with the same allowlist handle_new_user()
-- applies — anything other than 'supplier' or 'us_importer' falls back to
-- 'supplier'. Promote your own account to administrator afterwards with
-- supabase/seed/promote_first_admin.sql.
--
-- The BEFORE INSERT trigger on profiles creates a suppliers row for each
-- supplier/exporter account automatically, exactly as it would at signup.
--
--   insert into public.profiles (id, email, full_name, organization_name, country, role, user_status)
--   select
--     u.id,
--     coalesce(u.email, ''),
--     nullif(u.raw_user_meta_data->>'full_name', ''),
--     nullif(u.raw_user_meta_data->>'organization_name', ''),
--     nullif(u.raw_user_meta_data->>'country', ''),
--     case
--       when u.raw_user_meta_data->>'role' in ('supplier', 'us_importer')
--         then (u.raw_user_meta_data->>'role')::app_role
--       else 'supplier'::app_role
--     end,
--     'pending'
--   from auth.users u
--   on conflict (id) do nothing;
--
-- Importer accounts intentionally come back with importer_id = NULL and
-- user_status = 'pending'. That is the new model: an administrator creates the
-- organization at approval time. To attach one to a seeded tenant instead:
--
--   update public.profiles
--   set importer_id = '11111111-1111-1111-1111-111111111111',  -- GreenPath
--       user_status = 'active'
--   where email = 'you@example.com';
