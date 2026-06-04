-- 011_reference_library_templates.sql — versioned hazard library, document templates,
-- and remaining FK backfills

create table hazard_library_versions (
  id                              uuid primary key default gen_random_uuid(),
  version_tag                     text not null unique,
  effective_from                  date not null,
  notes                           text,
  created_at                      timestamptz not null default now()
);

create table hazard_library (
  id                              uuid primary key default gen_random_uuid(),
  version_id                      uuid not null references hazard_library_versions(id) on delete cascade,
  commodity_category              text not null,
  commodity_subcategory           text,
  hazard_type                     text not null check (hazard_type in
                                    ('biological','chemical','radiological','physical')),
  hazard_name                     text not null,
  typical_severity                text,
  typical_probability             text,
  typical_sahcodha                boolean not null default false,
  recommended_controls            text,
  fda_citation                    text,
  created_at                      timestamptz not null default now()
);
create index ix_hazard_lib_lookup on hazard_library (version_id, commodity_category, hazard_type);

alter table hazard_analysis_hazards
  add constraint fk_hazard_library_version
  foreign key (hazard_library_version_id) references hazard_library(id) on delete set null;

create table document_templates (
  id                              uuid primary key default gen_random_uuid(),
  template_key                    text not null,
  version                         text not null,
  body_markdown                   text not null,
  meets_cfr_section               text,
  active                          boolean not null default true,
  created_at                      timestamptz not null default now(),
  unique (template_key, version)
);

alter table supplier_written_assurances
  add constraint fk_swa_template foreign key (template_id) references document_templates(id) on delete set null;
