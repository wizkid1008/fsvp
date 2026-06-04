-- 010_supplier_portal_api_ops.sql — supplier portal tokens/uploads, broker API credentials,
-- scheduled job dedupe, subscription entitlements

create table supplier_portal_tokens (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete cascade,
  token                           text not null unique,
  token_hash                      text not null,
  scopes                          text[] not null,
  target_entity_type              text,
  target_entity_id                uuid,
  expires_at                      timestamptz not null,
  consumed_at                     timestamptz,
  revoked_at                      timestamptz,
  last_used_at                    timestamptz,
  last_used_ip                    inet,
  created_at                      timestamptz not null default now()
);
create index ix_supplier_tokens_active
  on supplier_portal_tokens (supplier_id)
  where consumed_at is null and revoked_at is null;

create table supplier_portal_uploads (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  supplier_id                     uuid not null references foreign_suppliers(id) on delete cascade,
  token_id                        uuid references supplier_portal_tokens(id) on delete set null,
  document_id                     uuid references documents(id) on delete set null,
  uploaded_at                     timestamptz not null default now(),
  uploader_ip                     inet,
  uploader_user_agent             text
);

create table api_credentials (
  id                              uuid primary key default gen_random_uuid(),
  broker_org_name                 text not null,
  importer_id                     uuid not null references importers(id) on delete cascade,
  key_prefix                      text not null,
  key_hash                        text not null,
  scopes                          text[] not null,
  last_used_at                    timestamptz,
  last_used_ip                    inet,
  revoked_at                      timestamptz,
  created_at                      timestamptz not null default now()
);
create unique index ux_api_key_prefix on api_credentials (key_prefix);

create table scheduled_job_runs (
  id                              uuid primary key default gen_random_uuid(),
  job_key                         text not null,
  run_idempotency_key             text not null,
  started_at                      timestamptz not null default now(),
  finished_at                     timestamptz,
  status                          text not null default 'running' check (status in
                                    ('running','succeeded','failed','partial')),
  rows_processed                  int,
  error_text                      text,
  unique (job_key, run_idempotency_key)
);

create table subscription_entitlements (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  plan_key                        text not null,
  stripe_subscription_id          text,
  max_suppliers                   int,
  max_foods                       int,
  max_users                       int,
  features                        text[] not null default '{}',
  period_start                    timestamptz,
  period_end                      timestamptz,
  status                          text not null default 'active' check (status in
                                    ('active','past_due','cancelled','trialing')),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index ix_entitlements_importer on subscription_entitlements (importer_id, status);
