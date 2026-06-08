-- 023_documents_supplier_evidence.sql
-- Makes documents.importer_id nullable so suppliers can upload evidence
-- independently of any single importer.
-- Also adds supplier_id to documents for direct supplier attribution.

alter table documents
  alter column importer_id drop not null;

alter table documents
  add column if not exists supplier_id uuid references suppliers(id) on delete set null;

create index if not exists ix_documents_supplier
  on documents (supplier_id)
  where supplier_id is not null and soft_deleted_at is null;

-- Suppliers can now read/write their own documents
drop policy if exists supplier_documents_read_by_supplier on documents;
create policy supplier_documents_read_by_supplier on documents
  for select to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    or uploaded_by_profile_id = auth.uid()
  );

drop policy if exists supplier_documents_write_by_supplier on documents;
create policy supplier_documents_write_by_supplier on documents
  for all to authenticated
  using (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    or uploaded_by_profile_id = auth.uid()
  )
  with check (
    public.is_platform_admin()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles
      where id = auth.uid() and supplier_id is not null
    )
    or uploaded_by_profile_id = auth.uid()
  );

-- Reviewers can read all documents for review
drop policy if exists reviewer_documents_read on documents;
create policy reviewer_documents_read on documents
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from profiles
      where id = auth.uid() and role::text in ('reviewer', 'us_importer', 'administrator')
    )
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
    or uploaded_by_profile_id = auth.uid()
  );

-- Storage policy: suppliers can upload to supplier-documents bucket using their supplier_id as prefix
drop policy if exists supplier_documents_write_supplier_prefix on storage.objects;
create policy supplier_documents_write_supplier_prefix on storage.objects
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
