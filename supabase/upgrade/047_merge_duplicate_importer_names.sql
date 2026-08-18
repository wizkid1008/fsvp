-- ============================================================================
-- 047_merge_duplicate_importer_names.sql
--
-- Consolidates duplicate importer tenant rows named "Nutty Cathy".
-- Canonical row: most attached profiles, then oldest.
-- ============================================================================

begin;

do $$
declare
  v_target_name text := 'Nutty Cathy';
  m record;
  r record;
  n bigint;
  v_total bigint := 0;
  v_sources bigint := 0;
begin
  for m in
    with scoped as (
      select
        i.id,
        i.display_name,
        i.created_at,
        lower(regexp_replace(btrim(i.display_name), '\s+', ' ', 'g')) as normalized_name,
        count(p.id) as profile_count
      from importers i
      left join profiles p on p.importer_id = i.id
      where lower(regexp_replace(btrim(i.display_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(v_target_name), '\s+', ' ', 'g'))
      group by i.id, i.display_name, i.created_at
    ),
    ranked as (
      select
        s.*,
        count(*) over (partition by s.normalized_name) as duplicate_count,
        first_value(s.id) over (
          partition by s.normalized_name
          order by s.profile_count desc, s.created_at asc, s.id asc
        ) as target_id
      from scoped s
    )
    select id as source_id, target_id, display_name
    from ranked
    where duplicate_count > 1
      and id <> target_id
    order by created_at, id
  loop
    v_sources := v_sources + 1;
    raise notice 'Merging duplicate importer "%" : % -> %', m.display_name, m.source_id, m.target_id;

    update importers target
    set
      legal_name = coalesce(nullif(target.legal_name, ''), source.legal_name),
      ein = coalesce(nullif(target.ein, ''), source.ein),
      duns_number = coalesce(nullif(target.duns_number, ''), source.duns_number),
      primary_contact_email = coalesce(nullif(target.primary_contact_email, ''), source.primary_contact_email),
      updated_at = now()
    from importers source
    where target.id = m.target_id
      and source.id = m.source_id;

    delete from importer_entry_identities s
    where s.importer_id = m.source_id
      and s.effective_to is null
      and exists (
        select 1 from importer_entry_identities t
        where t.importer_id = m.target_id and t.effective_to is null
      );

    delete from supplier_relationships s
    where s.importer_id = m.source_id
      and exists (
        select 1 from supplier_relationships t
        where t.importer_id = m.target_id and t.supplier_id = s.supplier_id
      );

    delete from fsvp_records s
    where s.importer_id = m.source_id
      and exists (
        select 1 from fsvp_records t
        where t.importer_id = m.target_id
          and t.supplier_id = s.supplier_id
          and t.facility_id = s.facility_id
          and t.product_id = s.product_id
      );

    delete from qualified_individuals s
    where s.importer_id = m.source_id
      and exists (
        select 1 from qualified_individuals t
        where t.importer_id = m.target_id and t.profile_id = s.profile_id
      );

    delete from fsvp_applicability_determinations s
    where s.importer_id = m.source_id
      and s.superseded_at is null
      and exists (
        select 1 from fsvp_applicability_determinations t
        where t.importer_id = m.target_id
          and t.supplier_id = s.supplier_id
          and t.product_id = s.product_id
          and t.superseded_at is null
      );

    delete from supplier_compliance_history s
    where s.importer_id = m.source_id
      and s.supplier_id is not null
      and exists (
        select 1 from supplier_compliance_history t
        where t.importer_id = m.target_id
          and t.regulatory_event_id = s.regulatory_event_id
          and t.supplier_id = s.supplier_id
      );

    delete from supplier_compliance_history s
    where s.importer_id = m.source_id
      and s.facility_id is not null
      and exists (
        select 1 from supplier_compliance_history t
        where t.importer_id = m.target_id
          and t.regulatory_event_id = s.regulatory_event_id
          and t.facility_id = s.facility_id
      );

    delete from supplier_compliance_screenings s
    where s.importer_id = m.source_id
      and s.superseded_at is null
      and exists (
        select 1 from supplier_compliance_screenings t
        where t.importer_id = m.target_id
          and t.supplier_id = s.supplier_id
          and t.superseded_at is null
      );

    delete from supplier_suspensions s
    where s.importer_id = m.source_id
      and s.lifted_at is null
      and exists (
        select 1 from supplier_suspensions t
        where t.importer_id = m.target_id
          and t.supplier_id = s.supplier_id
          and t.lifted_at is null
      );

    delete from importer_procedures s
    where s.importer_id = m.source_id
      and s.status in ('draft', 'adopted')
      and exists (
        select 1 from importer_procedures t
        where t.importer_id = m.target_id
          and t.kind = s.kind
          and t.status = s.status
          and t.status in ('draft', 'adopted')
      );

    alter table profiles disable trigger trg_profiles_prevent_role_escalation;

    for r in
      select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public'
        and c.column_name = 'importer_id'
        and t.table_type = 'BASE TABLE'
        and c.table_name <> 'importers'
      order by c.table_name
    loop
      execute format(
        'update public.%I set importer_id = $1 where importer_id = $2',
        r.table_name
      ) using m.target_id, m.source_id;
      get diagnostics n = row_count;
      v_total := v_total + n;
      if n > 0 then
        raise notice '  % : % row(s) remapped', r.table_name, n;
      end if;
    end loop;

    alter table profiles enable trigger trg_profiles_prevent_role_escalation;

    update suppliers
    set managed_by_importer_id = m.target_id
    where managed_by_importer_id = m.source_id;
    get diagnostics n = row_count;
    v_total := v_total + n;
    if n > 0 then
      raise notice '  suppliers.managed_by_importer_id : % row(s) remapped', n;
    end if;

    insert into audit_logs (importer_id, actor_role, action, record_type, record_id, new_value)
    values (
      m.target_id,
      'administrator',
      'duplicate_importer_merged',
      'importers',
      m.source_id,
      jsonb_build_object(
        'source_importer_id', m.source_id,
        'target_importer_id', m.target_id,
        'display_name', m.display_name
      )
    );

    delete from importers where id = m.source_id;
  end loop;

  if v_sources = 0 then
    raise notice 'No duplicate importer rows named "%" were found.', v_target_name;
  else
    raise notice 'Remapped % row(s) and deleted % duplicate importer row(s).', v_total, v_sources;
  end if;
end $$;

commit;
