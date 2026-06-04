-- 002_qis_eligibility.sql — QIs, credentials, VSI thresholds, eligibility attestations

-- Qualified Individuals (§ 1.503)
create table qualified_individuals (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  full_name                       text not null,
  email                           text,
  employment_type                 text not null check (employment_type in
                                    ('employee','consultant','third_party')),
  qualifications_text             text not null,
  qi_for_activities               text[] not null,
  active                          boolean not null default true,
  start_date                      date,
  end_date                        date,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

alter table importer_users
  add constraint fk_importer_users_qi
  foreign key (qi_id) references qualified_individuals(id) on delete set null;

-- Per-credential expiry tracking
create table qi_credentials (
  id                              uuid primary key default gen_random_uuid(),
  qi_id                           uuid not null references qualified_individuals(id) on delete cascade,
  importer_id                     uuid not null references importers(id) on delete cascade,
  credential_name                 text not null,
  issuing_body                    text,
  issued_on                       date,
  expires_on                      date,
  document_id                     uuid,   -- FK added in 008
  created_at                      timestamptz not null default now()
);
create index ix_qi_credentials_expiry
  on qi_credentials (importer_id, expires_on) where expires_on is not null;

-- VSI threshold reference (inflation-adjusted from 2011 baseline)
create table vsi_thresholds (
  effective_year                  int primary key,
  human_food_cents                bigint not null,
  animal_food_cents               bigint not null,
  source_citation                 text
);

-- Annual VSI eligibility self-documentation (§ 1.512(b)(1))
create table eligibility_attestations (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  attestation_year                int not null,
  sales_lookback_start_year       int not null,
  sales_lookback_end_year         int not null,
  human_food_avg_annual_sales_cents  bigint,
  animal_food_avg_annual_sales_cents bigint,
  threshold_human_cents_used      bigint not null,
  threshold_animal_cents_used     bigint not null,
  qualifies_as_vsi                boolean not null,
  attested_by_user_id             uuid not null references importer_users(id),
  attested_at                     timestamptz not null,
  supporting_docs_note            text,
  created_at                      timestamptz not null default now(),
  unique (importer_id, attestation_year)
);

-- Derived view: current-year compliance path per importer
create view importer_effective_path as
  select
    i.id as importer_id,
    coalesce(
      (select case when qualifies_as_vsi then 'vsi' else 'full_fsvp' end
         from eligibility_attestations
         where importer_id = i.id
           and attestation_year = extract(year from now())::int
         order by attested_at desc limit 1),
      'full_fsvp'
    ) as compliance_path
  from importers i;
