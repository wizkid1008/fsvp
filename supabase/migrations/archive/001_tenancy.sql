-- 001_tenancy.sql — extensions, helpers, importers, identities, users, role_permissions

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- Importers (tenants)
create table importers (
  id                              uuid primary key default gen_random_uuid(),
  legal_name                      text not null,
  display_name                    text not null,
  ein                             text,
  food_scope                      text not null check (food_scope in ('human','animal','both')),
  timezone                        text not null default 'America/New_York',
  address_json                    jsonb not null,
  primary_contact_user_id         uuid,
  stripe_customer_id              text,
  status                          text not null default 'active'
                                    check (status in ('active','suspended','closed')),
  status_history                  jsonb not null default '[]'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- Effective-dated CBP identity (§ 1.509)
create table importer_entry_identities (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  duns_number                     text not null,
  contact_email                   text not null,
  contact_name                    text not null,
  effective_from                  timestamptz not null,
  effective_to                    timestamptz,
  created_at                      timestamptz not null default now()
);
create unique index ux_importer_current_identity
  on importer_entry_identities (importer_id) where effective_to is null;
create index ix_importer_identity_window
  on importer_entry_identities (importer_id, effective_from, effective_to);

create table importer_users (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  clerk_user_id                   text not null,
  email                           text not null,
  full_name                       text,
  role                            text not null check (role in
                                    ('owner','admin','qi','contributor','viewer')),
  qi_id                           uuid,
  invited_at                      timestamptz,
  accepted_at                     timestamptz,
  removed_at                      timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (importer_id, clerk_user_id)
);
create index ix_importer_users_clerk on importer_users (clerk_user_id) where removed_at is null;

alter table importers
  add constraint fk_importers_primary_contact
  foreign key (primary_contact_user_id) references importer_users(id) on delete set null;

create table role_permissions (
  role                            text not null,
  permission                      text not null,
  primary key (role, permission)
);
