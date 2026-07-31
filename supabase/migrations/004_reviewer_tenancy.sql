-- ============================================================================
-- 004_reviewer_tenancy.sql — scope the reviewer role to a tenant
--
-- Until now `reviewer` was platform-wide: eleven policies in 001_baseline_rls
-- granted it blanket access with no tenant filter, so any reviewer could read
-- every importer's suppliers, documents, products and FSVP records.
--
-- That is the right behaviour for a platform compliance reviewer, and the wrong
-- behaviour for the case 005 introduces: an outside FSVP qualified individual
-- who needs a login inside ONE importer's tenant so they can sign attestations.
-- Making that consultant a reviewer under the old policies would have handed
-- them every other importer's book.
--
-- The split is by `profiles.importer_id`:
--
--   reviewer WITHOUT importer_id → platform reviewer, sees everything (unchanged)
--   reviewer WITH    importer_id → tenant reviewer, sees only that tenant
--
-- The change is small because every affected policy ALREADY carries an
--   importer_id in (select public.current_importer_ids())
-- branch, and current_importer_ids() reads the caller's own profiles.importer_id.
-- A tenant reviewer is therefore picked up by the existing tenant branch for
-- free; only the blanket reviewer clause needs narrowing to is_platform_reviewer().
--
-- Separately, a tenant reviewer must be able to READ their tenant and SIGN, but
-- must not be able to approve records, edit suppliers, or manage the org. Write
-- policies that confer those powers move from current_importer_ids() to
-- current_importer_ids_write(), which excludes reviewers. The three tables a QI
-- must write — hazard analyses, hazard items, verification records — plus record
-- evidence deliberately keep current_importer_ids(): that is the work a QI is
-- attesting to, and they have to be able to do it.
--
-- Note: replacing `role in ('reviewer','administrator')` with
-- is_platform_reviewer() / is_platform_admin() also tightens five read sites to
-- user_status = 'active', which they should always have had — a suspended
-- administrator previously kept full read access.
-- ============================================================================

begin;

-- ── Helpers ────────────────────────────────────────────────────────────────

-- Mirrors public.is_platform_admin(). A reviewer with no importer_id is a
-- platform-wide compliance reviewer; one with an importer_id is a tenant user
-- and is scoped by current_importer_ids() like anyone else.
create or replace function public.is_platform_reviewer()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'reviewer'
      and importer_id is null
      and user_status = 'active'
  );
$$;

-- The tenants the caller may WRITE to. Same body as current_importer_ids()
-- minus reviewers: a tenant reviewer (an FSVP qualified individual) reads the
-- tenant and signs attestations, but does not approve records or manage the
-- organization. Used in the using/with-check halves of the write policies below.
create or replace function public.current_importer_ids_write()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select importer_id from profiles
  where id = auth.uid()
    and importer_id is not null
    and role::text <> 'reviewer';
$$;

-- ── Importers ──────────────────────────────────────────────────────────────

drop policy if exists importers_tenant_write on importers;
create policy importers_tenant_write on importers
  for all to authenticated
  using (public.is_platform_admin() or id in (select public.current_importer_ids_write()))
  with check (public.is_platform_admin() or id in (select public.current_importer_ids_write()));

-- Was a single `for all` policy, which would have given a tenant QI write access
-- to the § 1.509 entry identities. Split so they keep the read and lose the write.
drop policy if exists importer_identities_tenant on importer_entry_identities;
create policy importer_identities_read on importer_entry_identities
  for select to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));
create policy importer_identities_write on importer_entry_identities
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()));

-- ── Suppliers ──────────────────────────────────────────────────────────────

drop policy if exists suppliers_read on suppliers;
create policy suppliers_read on suppliers
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
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

drop policy if exists suppliers_write on suppliers;
create policy suppliers_write on suppliers
  for all to authenticated
  using (
    public.is_platform_admin()
    or id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    or (
      record_mode <> 'self_managed'
      and managed_by_importer_id in (select public.current_importer_ids_write())
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
      and managed_by_importer_id in (select public.current_importer_ids_write())
    )
    or exists (
      select 1 from profiles
      where id = auth.uid() and supplier_id is not null
    )
    or exists (
      select 1 from profiles
      where id = auth.uid() and role::text = 'us_importer' and importer_id is not null
    )
  );

-- ── Facilities and products ────────────────────────────────────────────────

drop policy if exists facilities_read on facilities_verify;
create policy facilities_read on facilities_verify
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or id in (
      select facility_id from facility_supplier_access
      where supplier_id in (
        select supplier_id from profiles where id = auth.uid() and supplier_id is not null
      )
    )
    or supplier_id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and importer_id in (select public.current_importer_ids())
    )
    or public.is_linked_supplier(supplier_id)
  );

drop policy if exists facilities_write on facilities_verify;
create policy facilities_write on facilities_verify
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids_write())
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
    or supplier_id in (
      select id from suppliers
      where record_mode <> 'self_managed'
        and managed_by_importer_id in (select public.current_importer_ids_write())
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids_write())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select id from suppliers
      where record_mode <> 'self_managed'
        and managed_by_importer_id in (select public.current_importer_ids_write())
    )
    or public.is_linked_supplier(supplier_id)
  );

drop policy if exists fsa_write on facility_supplier_access;
create policy fsa_write on facility_supplier_access
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids_write())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids_write())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

drop policy if exists products_read on products_verify;
create policy products_read on products_verify
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
        and importer_id in (select public.current_importer_ids())
    )
    or public.is_linked_supplier(supplier_id)
  );

drop policy if exists products_write on products_verify;
create policy products_write on products_verify
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids_write())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select id from suppliers
      where record_mode <> 'self_managed'
        and managed_by_importer_id in (select public.current_importer_ids_write())
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids_write())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select id from suppliers
      where record_mode <> 'self_managed'
        and managed_by_importer_id in (select public.current_importer_ids_write())
    )
    or public.is_linked_supplier(supplier_id)
  );

-- ── Documents ──────────────────────────────────────────────────────────────

drop policy if exists documents_read on documents;
create policy documents_read on documents
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
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

drop policy if exists documents_write on documents;
create policy documents_write on documents
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids_write())
    or uploaded_by_profile_id = auth.uid()
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and status in ('active', 'pending_invite')
        and importer_id in (select public.current_importer_ids_write())
    )
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids_write())
    or uploaded_by_profile_id = auth.uid()
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or supplier_id in (
      select supplier_id from supplier_relationships
      where relationship_type = 'importer_supplier'
        and status in ('active', 'pending_invite')
        and importer_id in (select public.current_importer_ids_write())
    )
  );

-- ── FSVP records ───────────────────────────────────────────────────────────

drop policy if exists fsvp_records_read on fsvp_records;
create policy fsvp_records_read on fsvp_records
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
    -- the exporter can see records naming them, so they know what is expected
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

-- The gate that keeps a qualified individual from approving their own work: a
-- tenant reviewer can read the record and sign attestations against it, but
-- cannot change its status. /api/fsvp-records/[id]/approve enforces the same
-- rule at the API layer by allowing only us_importer and administrator.
drop policy if exists fsvp_records_write on fsvp_records;
create policy fsvp_records_write on fsvp_records
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()));

-- Child tables: reads narrow to platform reviewers. Writes deliberately keep
-- current_importer_ids() — hazard analyses, hazard items, verification records
-- and record evidence are the QI's own work product.
do $$
declare t text;
begin
  foreach t in array array[
    'fsvp_record_evidence', 'fsvp_plan_hazard_analyses', 'fsvp_verification_records'
  ] loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format($f$
      create policy %I_read on %I for select to authenticated
      using (
        public.is_platform_admin()
        or public.is_platform_reviewer()
        or exists (
          select 1 from fsvp_records r
          where r.id = %I.fsvp_record_id
            and r.importer_id in (select public.current_importer_ids())
        )
      );
    $f$, t, t, t);
  end loop;
end $$;

drop policy if exists hazard_items_read on fsvp_plan_hazard_items;
create policy hazard_items_read on fsvp_plan_hazard_items
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or exists (
      select 1 from fsvp_plan_hazard_analyses ha
      join fsvp_records r on r.id = ha.fsvp_record_id
      where ha.id = fsvp_plan_hazard_items.hazard_analysis_id
        and r.importer_id in (select public.current_importer_ids())
    )
  );

-- ── Importer-scoped operational tables ─────────────────────────────────────
--
-- approval_decisions is the one that matters here: a tenant QI must not be able
-- to write an approval. The rest follow the same rule for consistency — a QI
-- reads them and signs, the importer manages them.

do $$
declare t text;
begin
  foreach t in array array[
    'approval_decisions', 'reassessment_schedules', 'corrective_actions',
    'fsvp_reassessments', 'readiness_assessments', 'readiness_scores',
    'generated_reports', 'compliance_alerts', 'import_entries'
  ] loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format(
      'create policy %I_read on %I for select to authenticated
         using (
           public.is_platform_admin()
           or public.is_platform_reviewer()
           or importer_id in (select public.current_importer_ids())
         );', t, t
    );

    execute format('drop policy if exists %I_write on %I', t, t);
    execute format(
      'create policy %I_write on %I for all to authenticated
         using (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()))
         with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids_write()));',
      t, t
    );
  end loop;
end $$;

-- ── Audit log ──────────────────────────────────────────────────────────────

drop policy if exists audit_logs_read on audit_logs;
create policy audit_logs_read on audit_logs
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

-- ── Storage ────────────────────────────────────────────────────────────────

drop policy if exists supplier_documents_read on storage.objects;
create policy supplier_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'supplier-documents'
    and (
      public.is_platform_admin()
      or public.is_platform_reviewer()
      or split_part(name, '/', 1)::uuid in (select public.current_importer_ids())
      or split_part(name, '/', 1)::uuid in (
        select supplier_id from profiles where id = auth.uid() and supplier_id is not null
      )
      or split_part(name, '/', 2)::uuid in (
        select supplier_id from supplier_relationships
        where relationship_type = 'importer_supplier'
          and importer_id in (select public.current_importer_ids())
      )
    )
  );

commit;
