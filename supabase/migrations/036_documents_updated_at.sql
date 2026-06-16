-- 036_documents_updated_at.sql — documents table is missing the updated_at column
-- that trg_documents_updated_at (added in 012_triggers_rls_seed.sql) expects on every update.

alter table documents add column if not exists updated_at timestamptz not null default now();
