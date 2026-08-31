-- ============================================================================
-- 048_dedupe_rule_sets.sql
--
-- Collapses duplicate rule_sets rows sharing a set_name, then restores the
-- unique constraint the baseline declares and this database is missing.
--
-- 002_reference_data.sql seeds 'FSVP Standard' with ON CONFLICT DO NOTHING and
-- no conflict target. That is correct only while rule_sets.set_name is unique
-- (000_baseline.sql:526). On a database built through 045_importer_rebuild_in_place
-- the constraint is absent, so nothing ever conflicts and every re-run of the
-- seed inserts another 'FSVP Standard' with a full published version 1 beneath
-- it -- identical in name, scope and content to the one already there.
--
-- Two published sets scoped 'all' make fetchGoverningRuleVersion ambiguous, and
-- it refuses to guess rather than pick by version number (lib/fsvp/rule-version.ts).
-- That refusal is what returns "More than one published rule set claims FSVP
-- records" from POST /api/product-hazard-analysis/start and blocks Create on the
-- product required-documents checklist.
--
-- Losing versions are ARCHIVED, never deleted or repointed. A rule version is
-- what a record was judged against, so any fsvp_record already referencing one
-- keeps referencing it. Only `status = 'published'` is read when choosing a
-- governing version, so archiving alone resolves the ambiguity.
-- ============================================================================

begin;

-- ── 1. Supersede every duplicate but the canonical row ──────────────────────
do $$
declare
  m          record;
  v_dupes    bigint := 0;
  v_archived bigint := 0;
  n          bigint;
begin
  for m in
    with scoped as (
      select
        rs.id,
        rs.set_name,
        rs.created_at,
        lower(regexp_replace(btrim(rs.set_name), '\s+', ' ', 'g')) as normalized_name,
        -- Real usage, not seeded scaffolding: requirement_sections and
        -- approval_thresholds exist under both copies because the same seed
        -- built both. Only an fsvp_record tells them apart.
        (
          select count(*)
          from fsvp_records fr
          join rule_versions rv on rv.id = fr.rule_version_id
          where rv.rule_set_id = rs.id
        ) as record_count
      from rule_sets rs
    ),
    ranked as (
      select
        s.*,
        count(*) over (partition by s.normalized_name) as duplicate_count,
        first_value(s.id) over (
          partition by s.normalized_name
          order by s.record_count desc, s.created_at asc, s.id asc
        ) as keep_id
      from scoped s
    )
    select id as drop_id, keep_id, set_name, record_count
    from ranked
    where duplicate_count > 1
      and id <> keep_id
    order by created_at, id
  loop
    v_dupes := v_dupes + 1;
    raise notice 'Duplicate rule set "%": % superseded by % (% record(s) attached)',
      m.set_name, m.drop_id, m.keep_id, m.record_count;

    update rule_versions
    set status      = 'archived',
        archived_at = coalesce(archived_at, now())
    where rule_set_id = m.drop_id
      and status = 'published';
    get diagnostics n = row_count;
    v_archived := v_archived + n;
    raise notice '  % published version(s) archived', n;

    -- Renamed rather than deleted: deleting cascades to rule_versions, and
    -- fsvp_records / scoring_results / approval_decisions reference those with
    -- ON DELETE RESTRICT, so a set with any history attached would block the
    -- delete outright. The suffix also makes the row self-explanatory in the
    -- rule builder instead of looking like a second live standard.
    update rule_sets
    set set_name   = left(set_name, 80) || ' (superseded ' || left(m.drop_id::text, 8) || ')',
        updated_at = now()
    where id = m.drop_id;

    insert into audit_logs (actor_role, action, record_type, record_id, new_value)
    values (
      'administrator',
      'duplicate_rule_set_archived',
      'rule_sets',
      m.drop_id,
      jsonb_build_object(
        'superseded_rule_set_id', m.drop_id,
        'governing_rule_set_id',  m.keep_id,
        'set_name',               m.set_name,
        'attached_record_count',  m.record_count
      )
    );
  end loop;

  if v_dupes = 0 then
    raise notice 'No duplicate rule set names found.';
  else
    raise notice 'Superseded % duplicate rule set(s), archiving % published version(s).',
      v_dupes, v_archived;
  end if;
end $$;

-- ── 2. Restore the constraint that would have prevented all of this ─────────
do $$
begin
  if exists (
    select 1 from rule_sets group by set_name having count(*) > 1
  ) then
    raise exception 'rule_sets still holds duplicate set_name values; refusing to add the unique constraint.';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.rule_sets'::regclass
      and c.contype  = 'u'
      and array_length(c.conkey, 1) = 1
      and a.attname  = 'set_name'
  ) then
    alter table rule_sets add constraint rule_sets_set_name_key unique (set_name);
    raise notice 'Added rule_sets_set_name_key unique (set_name).';
  else
    raise notice 'rule_sets already carries a unique constraint on set_name.';
  end if;
end $$;

-- ── 3. Assert the state the application actually requires ───────────────────
-- Mirrors fetchGoverningRuleVersion exactly: distinct rule sets owning a
-- published version whose scope can govern an FSVP record.
do $$
declare
  v_count int;
begin
  select count(distinct rs.id) into v_count
  from rule_sets rs
  join rule_versions rv on rv.rule_set_id = rs.id
  where rv.status = 'published'
    and rs.applies_to in ('fsvp_record', 'all');

  if v_count = 1 then
    raise notice 'OK: exactly one published rule set governs FSVP records.';
  elsif v_count = 0 then
    raise exception 'No published rule set governs FSVP records; records could not be opened.';
  else
    raise exception 'Still % published rule sets claiming FSVP records.', v_count;
  end if;
end $$;

commit;
