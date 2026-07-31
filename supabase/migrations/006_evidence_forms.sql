-- ============================================================================
-- 006_evidence_forms.sql — online forms as evidence
--
-- Every requirement item rendered an Upload tile, so a supplier questionnaire —
-- a set of questions, not a document the supplier already holds — had to be
-- completed offline and uploaded. `requirement_items.evidence_type` has existed
-- since the baseline and even had a 'form' value seeded against
-- primary_contact_info, but nothing ever read the column.
--
-- The load-bearing idea: **a submitted form response also produces a documents
-- row carrying the requirement_item_id.** Scoring (lib/scoring/engine.ts), the
-- review queue, the bestStatus ranking, expiry and the FDA inspection package
-- are all keyed on documents, so none of them change. The reviewer accepts or
-- rejects the rendered response exactly like any other evidence, while the
-- structured answers ride alongside for querying and future rule logic.
--
-- That is the same shape as the QI attestation ledger in 005: keep the
-- structured record AND a snapshot of what was actually submitted, because a
-- response edited after review is the same hazard as a narrative edited after
-- signing.
--
-- This migration also fixes a live scoring bug. components/corporate/
-- CorporateScopeList.tsx special-cased the contacts section and rendered an
-- inline form writing suppliers.contact_json — which satisfied nothing, because
-- isItemSatisfied() counts only accepted documents. primary_contact_info and
-- regulatory_contact therefore read not_submitted however completely they were
-- filled in, permanently depressing the section score. Routing them through the
-- same form engine makes them count.
-- ============================================================================

begin;

-- ── Definitions ────────────────────────────────────────────────────────────

create table form_definitions (
  id                  uuid primary key default gen_random_uuid(),
  rule_version_id     uuid not null references rule_versions(id) on delete cascade,
  -- One form per requirement item. A form exists to satisfy an item; a form
  -- satisfying two items would leave the second one's status ambiguous.
  requirement_item_id uuid not null unique references requirement_items(id) on delete cascade,
  form_key            text not null,
  title               text not null,
  description         text,
  -- Sections and fields. Validated in TypeScript (lib/forms/schema.ts) rather
  -- than by a check constraint, so an authoring mistake fails at the admin
  -- screen with a usable message instead of as a Postgres error.
  schema_json         jsonb not null,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (rule_version_id, form_key)
);

create index ix_form_definitions_version on form_definitions (rule_version_id);

-- Published rule versions are immutable, matching requirement_items. Update
-- only, not insert — the same as trg_requirement_items_published_guard, which
-- also permits adding to a published version.
create or replace function public.prevent_published_form_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from rule_versions
    where id = coalesce(old.rule_version_id, new.rule_version_id)
      and status = 'published'
  ) then
    raise exception 'Published rule versions cannot be edited. Clone into a new draft first.';
  end if;
  return new;
end;
$$;

create trigger trg_form_definitions_published_guard
  before update on form_definitions
  for each row execute function public.prevent_published_form_edit();

-- ── Responses ──────────────────────────────────────────────────────────────

create table form_responses (
  id                     uuid primary key default gen_random_uuid(),
  form_definition_id     uuid not null references form_definitions(id) on delete restrict,
  supplier_id            uuid not null references suppliers(id) on delete cascade,
  importer_id            uuid references importers(id) on delete set null,
  -- Denormalised so the checklist can find responses without joining through
  -- the definition on every render.
  requirement_item_id    uuid references requirement_items(id) on delete set null,
  version                int not null default 1,
  answers_json           jsonb not null default '{}'::jsonb,
  -- Review status lives on the rendered document, not here. This is only
  -- "still being filled in" vs "handed over".
  status                 text not null default 'draft'
                           check (status in ('draft', 'submitted')),
  document_id            uuid references documents(id) on delete set null,
  submitted_by_profile_id uuid references profiles(id) on delete set null,
  submitted_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (form_definition_id, supplier_id, version)
);

create index ix_form_responses_supplier on form_responses (supplier_id);
create index ix_form_responses_item     on form_responses (requirement_item_id, supplier_id);

create trigger trg_form_definitions_updated_at
  before update on form_definitions
  for each row execute function public.set_updated_at();
create trigger trg_form_responses_updated_at
  before update on form_responses
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table form_definitions enable row level security;
alter table form_responses   enable row level security;

-- Definitions are reference data, like requirement_items: everyone signed in
-- reads them, only a platform administrator writes them.
create policy form_definitions_read on form_definitions
  for select to authenticated using (true);
create policy form_definitions_admin_write on form_definitions
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Responses follow the documents pattern: the owning supplier, and any importer
-- linked to them, can read and write. current_importer_ids() rather than the
-- _write variant, because filling in a supplier's questionnaire on their behalf
-- is exactly the kind of evidence work a tenant QI does.
create policy form_responses_read on form_responses
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and status in ('active', 'pending_invite')
        and importer_id in (select public.current_importer_ids())
    )
  );

create policy form_responses_write on form_responses
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and status in ('active', 'pending_invite')
        and importer_id in (select public.current_importer_ids())
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and status in ('active', 'pending_invite')
        and importer_id in (select public.current_importer_ids())
    )
  );

commit;
