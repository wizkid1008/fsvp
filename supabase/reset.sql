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

-- 4. Delete auth users.
--    profiles.id references auth.users, and profiles rows are gone after step 1.
--    handle_new_user() only fires on INSERT to auth.users, so any surviving user
--    would be left permanently without a profile and unable to use the app.
delete from auth.users;
