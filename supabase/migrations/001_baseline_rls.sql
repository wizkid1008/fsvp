-- ============================================================================
-- 001_baseline_rls.sql — Row Level Security for the consolidated schema
--
-- Split from 000_baseline.sql so the access model can be read in one sitting.
-- Previously these policies were spread across migrations 012, 013, 014, 020,
-- 021, 022, 023, 027, 028, 029, 033, 035, 039 and 043, several of which
-- redefined the same policy. This is the resolved end state.
--
-- Tenancy rule: importer data is scoped by
--   importer_id in (select public.current_importer_ids())
-- Supplier data is scoped by the caller's profiles.supplier_id, or by an
-- active row in supplier_relationships.
-- ============================================================================

begin;

do $$
declare t text;
begin
  foreach t in array array[
    'importers', 'importer_entry_identities', 'profiles', 'countries',
    'suppliers', 'supplier_relationships', 'facilities_verify',
    'facility_supplier_access', 'products_verify', 'rule_sets', 'rule_versions',
    'approval_thresholds', 'requirement_sections', 'scoring_category_weights',
    'requirement_items', 'fsvp_requirements', 'documents', 'document_categories',
    'requirement_evidence', 'scoring_results', 'fsvp_records',
    'fsvp_record_evidence', 'approval_decisions', 'reassessment_schedules',
    'fsvp_plan_hazard_analyses', 'fsvp_plan_hazard_items',
    'fsvp_verification_records', 'corrective_actions', 'fsvp_reassessments',
    'readiness_assessments', 'readiness_scores', 'generated_reports',
    'app_notifications', 'notification_deliveries', 'compliance_alerts',
    'background_reference_documents', 'audit_logs', 'app_settings',
    'import_entries'
  ] loop
    -- Guarded so this file can also be applied on the upgrade path, where the
    -- database's migration history is partial and a table may never have been
    -- created. Policy statements further down are NOT guarded — a missing table
    -- there is a real problem and should fail loudly.
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I enable row level security', t);
    else
      raise warning 'Skipping RLS enable — table does not exist: %', t;
    end if;
  end loop;
end $$;

-- ============================================================================
-- Profiles
-- ============================================================================

create policy profiles_self_read on profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

create policy profiles_admin_insert on profiles
  for insert to authenticated
  with check (public.is_platform_admin());

-- ============================================================================
-- Importers
-- ============================================================================

create policy importers_tenant_read on importers
  for select to authenticated
  using (public.is_platform_admin() or id in (select public.current_importer_ids()));

create policy importers_tenant_write on importers
  for all to authenticated
  using (public.is_platform_admin() or id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or id in (select public.current_importer_ids()));

create policy importer_identities_tenant on importer_entry_identities
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

-- ============================================================================
-- Reference data — readable by everyone signed in, writable by admins
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'countries', 'rule_sets', 'rule_versions', 'approval_thresholds',
    'requirement_sections', 'scoring_category_weights', 'requirement_items',
    'document_categories', 'app_settings'
  ] loop
    execute format(
      'create policy %I_read on %I for select to authenticated using (true);', t, t
    );
    execute format(
      'create policy %I_admin_write on %I for all to authenticated
         using (public.is_platform_admin())
         with check (public.is_platform_admin());', t, t
    );
  end loop;
end $$;

create policy fsvp_requirements_read on fsvp_requirements
  for select to authenticated using (active);
create policy fsvp_requirements_admin_write on fsvp_requirements
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy background_reference_read on background_reference_documents
  for select to authenticated using (true);
create policy background_reference_admin_write on background_reference_documents
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ============================================================================
-- Suppliers
--
-- Read: own record; importers see linked exporters and records they manage;
--       exporters see upstream suppliers; suppliers see the exporters they
--       supply to; reviewers and admins see all.
-- Write: own record; the managing importer while the record is unclaimed;
--        any exporter/supplier may create new rows (upstream partner linking).
-- ============================================================================

create policy suppliers_read on suppliers
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from profiles
      where id = auth.uid() and role::text in ('reviewer', 'administrator')
    )
    -- own record
    or id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    -- records this importer manages directly
    or managed_by_importer_id in (select public.current_importer_ids())
    -- importer sees their linked exporters
    or id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and importer_id in (select public.current_importer_ids())
    )
    -- exporter sees their upstream suppliers
    or id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'exporter_supplier'
        and status = 'active'
        and exporter_id in (
          select supplier_id from profiles
          where id = auth.uid() and supplier_id is not null
        )
    )
    -- supplier sees the exporters they supply to
    or id in (
      select exporter_id from supplier_relationships
      where relationship_type = 'exporter_supplier'
        and status = 'active'
        and supplier_id in (
          select supplier_id from profiles
          where id = auth.uid() and supplier_id is not null
        )
    )
  );

create policy suppliers_write on suppliers
  for all to authenticated
  using (
    public.is_platform_admin()
    -- own record
    or id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    -- the managing importer, but only while the exporter has not claimed it
    or (
      record_mode <> 'self_managed'
      and managed_by_importer_id in (select public.current_importer_ids())
    )
  )
  with check (
    public.is_platform_admin()
    or id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    or (
      record_mode <> 'self_managed'
      and managed_by_importer_id in (select public.current_importer_ids())
    )
    -- Any authenticated exporter/supplier may create new supplier rows for
    -- upstream partner linking; the relationship row created immediately
    -- afterward constrains who can actually use the record.
    or exists (
      select 1 from profiles
      where id = auth.uid() and supplier_id is not null
    )
    -- Importers may create new exporter records (record_mode set by the API).
    or exists (
      select 1 from profiles
      where id = auth.uid() and role::text = 'us_importer' and importer_id is not null
    )
  );

-- ============================================================================
-- Supplier relationships
-- ============================================================================

create policy sr_read on supplier_relationships
  for select to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or exporter_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

create policy sr_insert on supplier_relationships
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or (
      relationship_type = 'importer_supplier'
      and importer_id in (select public.current_importer_ids())
    )
    or (
      relationship_type = 'exporter_supplier'
      and exporter_id in (
        select supplier_id from profiles where id = auth.uid() and supplier_id is not null
      )
    )
  );

-- Either party can update — a supplier accepting or declining an invite is an
-- update from the non-owning side.
create policy sr_update on supplier_relationships
  for update to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or exporter_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

create policy sr_delete on supplier_relationships
  for delete to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or exporter_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

-- ============================================================================
-- Facilities and products
-- ============================================================================

create policy facilities_read on facilities_verify
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from profiles
      where id = auth.uid() and role::text in ('reviewer', 'administrator')
    )
    or importer_id in (select public.current_importer_ids())
    -- owning supplier, or a supplier granted shared access
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or id in (
      select facility_id from facility_supplier_access
      where supplier_id in (
        select supplier_id from profiles where id = auth.uid() and supplier_id is not null
      )
    )
    -- importer sees facilities of exporters they are linked to
    or supplier_id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and importer_id in (select public.current_importer_ids())
    )
    or public.is_linked_supplier(supplier_id)
  );

create policy facilities_write on facilities_verify
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or id in (
      select facility_id from facility_supplier_access
      where access_level = 'manage'
        and supplier_id in (
          select supplier_id from profiles where id = auth.uid() and supplier_id is not null
        )
    )
    -- managing importer of an unclaimed exporter record
    or supplier_id in (
      select id from suppliers
      where record_mode <> 'self_managed'
        and managed_by_importer_id in (select public.current_importer_ids())
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select id from suppliers
      where record_mode <> 'self_managed'
        and managed_by_importer_id in (select public.current_importer_ids())
    )
    or public.is_linked_supplier(supplier_id)
  );

create policy fsa_read on facility_supplier_access
  for select to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

create policy fsa_write on facility_supplier_access
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

create policy products_read on products_verify
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from profiles
      where id = auth.uid() and role::text in ('reviewer', 'administrator')
    )
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and importer_id in (select public.current_importer_ids())
    )
    or public.is_linked_supplier(supplier_id)
  );

create policy products_write on products_verify
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select id from suppliers
      where record_mode <> 'self_managed'
        and managed_by_importer_id in (select public.current_importer_ids())
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select id from suppliers
      where record_mode <> 'self_managed'
        and managed_by_importer_id in (select public.current_importer_ids())
    )
    or public.is_linked_supplier(supplier_id)
  );

-- ============================================================================
-- Documents
-- ============================================================================

create policy documents_read on documents
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from profiles
      where id = auth.uid() and role::text in ('reviewer', 'administrator')
    )
    or importer_id in (select public.current_importer_ids())
    or uploaded_by_profile_id = auth.uid()
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    -- importer sees evidence from every exporter they are linked to, regardless
    -- of which importer_id was stamped at upload time
    or supplier_id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and status in ('active', 'pending_invite')
        and importer_id in (select public.current_importer_ids())
    )
  );

create policy documents_write on documents
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or uploaded_by_profile_id = auth.uid()
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
    or uploaded_by_profile_id = auth.uid()
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

create policy requirement_evidence_tenant on requirement_evidence
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

-- ============================================================================
-- Scoring — readable by all; written only by the scoring engine (service role)
-- ============================================================================

create policy scoring_results_read on scoring_results
  for select to authenticated using (true);

-- ============================================================================
-- FSVP records and children
-- ============================================================================

create policy fsvp_records_read on fsvp_records
  for select to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or exists (
      select 1 from profiles where id = auth.uid() and role::text = 'reviewer'
    )
    -- the exporter can see records naming them, so they know what is expected
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

create policy fsvp_records_write on fsvp_records
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

-- Child tables inherit fsvp_records tenancy.
do $$
declare t text;
begin
  foreach t in array array[
    'fsvp_record_evidence', 'fsvp_plan_hazard_analyses', 'fsvp_verification_records'
  ] loop
    execute format($f$
      create policy %I_read on %I for select to authenticated
      using (
        public.is_platform_admin()
        or exists (
          select 1 from fsvp_records r
          where r.id = %I.fsvp_record_id
            and (
              r.importer_id in (select public.current_importer_ids())
              or exists (select 1 from profiles where id = auth.uid() and role::text = 'reviewer')
            )
        )
      );
    $f$, t, t, t);

    execute format($f$
      create policy %I_write on %I for all to authenticated
      using (
        public.is_platform_admin()
        or exists (
          select 1 from fsvp_records r
          where r.id = %I.fsvp_record_id
            and r.importer_id in (select public.current_importer_ids())
        )
      )
      with check (
        public.is_platform_admin()
        or exists (
          select 1 from fsvp_records r
          where r.id = %I.fsvp_record_id
            and r.importer_id in (select public.current_importer_ids())
        )
      );
    $f$, t, t, t, t);
  end loop;
end $$;

create policy hazard_items_read on fsvp_plan_hazard_items
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_plan_hazard_analyses ha
      join fsvp_records r on r.id = ha.fsvp_record_id
      where ha.id = fsvp_plan_hazard_items.hazard_analysis_id
        and (
          r.importer_id in (select public.current_importer_ids())
          or exists (select 1 from profiles where id = auth.uid() and role::text = 'reviewer')
        )
    )
  );

create policy hazard_items_write on fsvp_plan_hazard_items
  for all to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_plan_hazard_analyses ha
      join fsvp_records r on r.id = ha.fsvp_record_id
      where ha.id = fsvp_plan_hazard_items.hazard_analysis_id
        and r.importer_id in (select public.current_importer_ids())
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_plan_hazard_analyses ha
      join fsvp_records r on r.id = ha.fsvp_record_id
      where ha.id = fsvp_plan_hazard_items.hazard_analysis_id
        and r.importer_id in (select public.current_importer_ids())
    )
  );

-- ============================================================================
-- Importer-scoped operational tables
-- ============================================================================

-- Reviewers get read access; the owning importer gets full access.
do $$
declare t text;
begin
  foreach t in array array[
    'approval_decisions', 'reassessment_schedules', 'corrective_actions',
    'fsvp_reassessments', 'readiness_assessments', 'readiness_scores',
    'generated_reports', 'compliance_alerts', 'import_entries'
  ] loop
    execute format(
      'create policy %I_read on %I for select to authenticated
         using (
           public.is_platform_admin()
           or importer_id in (select public.current_importer_ids())
           or exists (select 1 from profiles where id = auth.uid() and role::text = ''reviewer'')
         );', t, t
    );
    execute format(
      'create policy %I_write on %I for all to authenticated
         using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
         with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));',
      t, t
    );
  end loop;
end $$;

-- Notifications are addressed to a person, not just a tenant.
create policy notifications_read on app_notifications
  for select to authenticated
  using (
    public.is_platform_admin()
    or recipient_profile_id = auth.uid()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

create policy notifications_update on app_notifications
  for update to authenticated
  using (
    public.is_platform_admin()
    or recipient_profile_id = auth.uid()
    or importer_id in (select public.current_importer_ids())
  );

create policy notification_deliveries_tenant on notification_deliveries
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

-- Audit log is append-only from the app's perspective: no update or delete policy.
create policy audit_logs_read on audit_logs
  for select to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or exists (select 1 from profiles where id = auth.uid() and role::text = 'reviewer')
  );

create policy audit_logs_insert on audit_logs
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
  );

-- ============================================================================
-- Storage
--
-- Object paths are `<importer_id | supplier_id>/<supplier_id>/<file>`, so the
-- first path segment is the owning tenant. Suppliers uploading their own
-- evidence have no importer_id, which is why the supplier branch is required.
-- ============================================================================

create policy supplier_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'supplier-documents'
    and (
      public.is_platform_admin()
      or split_part(name, '/', 1)::uuid in (select public.current_importer_ids())
      or split_part(name, '/', 1)::uuid in (
        select supplier_id from profiles where id = auth.uid() and supplier_id is not null
      )
      or split_part(name, '/', 2)::uuid in (
        select supplier_id from supplier_relationships
        where relationship_type = 'importer_supplier'
          and importer_id in (select public.current_importer_ids())
      )
      or exists (
        select 1 from profiles
        where id = auth.uid() and role::text in ('reviewer', 'administrator')
      )
    )
  );

create policy supplier_documents_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'supplier-documents'
    and (
      public.is_platform_admin()
      or split_part(name, '/', 1)::uuid in (select public.current_importer_ids())
      or split_part(name, '/', 1)::uuid in (
        select supplier_id from profiles where id = auth.uid() and supplier_id is not null
      )
    )
  );

create policy background_documents_read on storage.objects
  for select to authenticated
  using (bucket_id = 'background-documents');

create policy background_documents_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'background-documents' and public.is_platform_admin())
  with check (bucket_id = 'background-documents' and public.is_platform_admin());

commit;
