-- 013_app_auth_storage_readiness.sql - Supabase Auth bridge and app-facing tables

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('supplier', 'reviewer', 'administrator');
  end if;
  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type user_status as enum ('active', 'pending', 'suspended');
  end if;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  importer_id uuid references importers(id) on delete set null,
  supplier_id uuid references foreign_suppliers(id) on delete set null,
  full_name text,
  email text not null,
  organization_name text,
  position text,
  phone_number text,
  country text,
  preferred_language text not null default 'en',
  supplier_type text,
  importer_type text,
  role app_role not null default 'supplier',
  user_status user_status not null default 'pending',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table importer_users add column if not exists supabase_user_id uuid references auth.users(id) on delete set null;
create index if not exists ix_importer_users_supabase_user on importer_users (supabase_user_id) where removed_at is null;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'administrator'
      and user_status = 'active'
  );
$$;

create or replace function public.current_importer_ids()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select importer_id from profiles where id = auth.uid() and importer_id is not null
  union
  select importer_id from importer_users where supabase_user_id = auth.uid() and removed_at is null;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, user_status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'supplier'),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_platform_admin() then
    return new;
  end if;

  new.role := old.role;
  new.user_status := old.user_status;
  new.importer_id := old.importer_id;
  new.supplier_id := old.supplier_id;
  return new;
end;
$$;

drop trigger if exists trg_profiles_prevent_role_escalation on profiles;
create trigger trg_profiles_prevent_role_escalation
  before update on profiles
  for each row execute function public.prevent_profile_role_escalation();

create table if not exists supplier_facilities (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid not null references foreign_suppliers(id) on delete cascade,
  facility_name text not null,
  facility_address_json jsonb not null default '{}'::jsonb,
  facility_type text not null,
  fda_registration_number text,
  production_capacity text,
  manufacturing_processes text,
  food_safety_certifications text[],
  certification_status text not null default 'pending_review'
    check (certification_status in ('active', 'pending_review', 'approved', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists supplier_products (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid not null references foreign_suppliers(id) on delete cascade,
  food_id uuid references foods(id) on delete set null,
  product_name text not null,
  product_category text,
  product_description text,
  ingredient_list text,
  country_of_origin text,
  intended_us_market text,
  product_specifications text,
  shelf_life text,
  packaging_information text,
  allergen_information text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version_number int not null,
  storage_path text not null,
  original_filename text,
  uploaded_by_profile_id uuid references profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  review_status text not null default 'submitted'
    check (review_status in ('draft', 'submitted', 'under_review', 'revision_required', 'approved', 'rejected')),
  review_notes text,
  unique (document_id, version_number)
);

create table if not exists document_reviews (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  reviewer_profile_id uuid references profiles(id) on delete set null,
  status text not null check (status in ('under_review', 'revision_required', 'approved', 'rejected')),
  notes text,
  reviewed_at timestamptz not null default now()
);

create table if not exists reviewer_assignments (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid not null references foreign_suppliers(id) on delete cascade,
  reviewer_profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  assigned_at timestamptz not null default now(),
  unique (supplier_id, reviewer_profile_id)
);

create table if not exists readiness_assessments (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid not null references foreign_suppliers(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'under_review', 'revision_required', 'approved')),
  overall_score numeric(5,2) not null default 0,
  gap_summary text,
  recommended_actions text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists readiness_scores (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  assessment_id uuid not null references readiness_assessments(id) on delete cascade,
  category text not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  evidence_summary text,
  gap_summary text,
  recommended_action text,
  created_at timestamptz not null default now(),
  unique (assessment_id, category)
);

create table if not exists review_comments (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid references foreign_suppliers(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  assessment_id uuid references readiness_assessments(id) on delete cascade,
  author_profile_id uuid references profiles(id) on delete set null,
  body text not null,
  visibility text not null default 'supplier_and_reviewer'
    check (visibility in ('internal', 'supplier_and_reviewer')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists app_notifications (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  recipient_profile_id uuid references profiles(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  target_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists generated_reports (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid not null references importers(id) on delete cascade,
  supplier_id uuid references foreign_suppliers(id) on delete set null,
  report_type text not null check (report_type in ('supplier_readiness', 'compliance_gap', 'document_status', 'audit', 'executive_summary')),
  export_format text not null check (export_format in ('pdf', 'excel')),
  title text not null,
  storage_path text,
  generated_by_profile_id uuid references profiles(id) on delete set null,
  generated_at timestamptz not null default now()
);

create table if not exists background_reference_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  storage_path text not null,
  maintained_by_profile_id uuid references profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete set null,
  actor_profile_id uuid references profiles(id) on delete set null,
  action text not null,
  record_type text,
  record_id uuid,
  previous_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('supplier-documents', 'supplier-documents', false, 52428800, null),
  ('background-documents', 'background-documents', false, 52428800, null)
on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','supplier_facilities','supplier_products','document_versions','document_reviews',
    'reviewer_assignments','readiness_assessments','readiness_scores','review_comments',
    'app_notifications','generated_reports','background_reference_documents','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

drop policy if exists profiles_admin_insert on profiles;
create policy profiles_admin_insert on profiles
  for insert to authenticated
  with check (public.is_platform_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'importer_entry_identities','importer_users','qualified_individuals','qi_credentials',
    'eligibility_attestations','foreign_suppliers','foods','food_supply_chain_links','hazard_analyses',
    'supplier_evaluations','supplier_written_assurances',
    'audit_substitution_assurances','customer_disclosure_assurances','verification_activities',
    'audit_details','sampling_test_results','verification_nonconformities','corrective_actions',
    'fsvp_reassessments','recall_events','fda_inspections',
    'fda_inspection_observations','import_entries','documents','record_signatures',
    'document_access_log','reminders','notification_deliveries','fda_request_bundles',
    'supplier_portal_tokens','supplier_portal_uploads','api_credentials','subscription_entitlements',
    'supplier_facilities','supplier_products','document_versions','document_reviews',
    'reviewer_assignments','readiness_assessments','readiness_scores','review_comments',
    'app_notifications','generated_reports','audit_logs'
  ] loop
    execute format(
      'drop policy if exists %I_tenant_read on %I;
       create policy %I_tenant_read on %I for select to authenticated
       using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));',
      t, t, t, t
    );
    execute format(
      'drop policy if exists %I_tenant_write on %I;
       create policy %I_tenant_write on %I for all to authenticated
       using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
       with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));',
      t, t, t, t
    );
  end loop;
end $$;

drop policy if exists importers_tenant_read on importers;
create policy importers_tenant_read on importers
  for select to authenticated
  using (public.is_platform_admin() or id in (select public.current_importer_ids()));

drop policy if exists importers_tenant_write on importers;
create policy importers_tenant_write on importers
  for all to authenticated
  using (public.is_platform_admin() or id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or id in (select public.current_importer_ids()));

drop policy if exists hazard_analysis_hazards_tenant_read on hazard_analysis_hazards;
create policy hazard_analysis_hazards_tenant_read on hazard_analysis_hazards
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from hazard_analyses ha
      where ha.id = hazard_analysis_id
        and ha.importer_id in (select public.current_importer_ids())
    )
  );

drop policy if exists hazard_analysis_hazards_tenant_write on hazard_analysis_hazards;
create policy hazard_analysis_hazards_tenant_write on hazard_analysis_hazards
  for all to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from hazard_analyses ha
      where ha.id = hazard_analysis_id
        and ha.importer_id in (select public.current_importer_ids())
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from hazard_analyses ha
      where ha.id = hazard_analysis_id
        and ha.importer_id in (select public.current_importer_ids())
    )
  );

drop policy if exists fsvp_reassessment_outcomes_tenant_read on fsvp_reassessment_outcomes;
create policy fsvp_reassessment_outcomes_tenant_read on fsvp_reassessment_outcomes
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_reassessments fr
      where fr.id = reassessment_id
        and fr.importer_id in (select public.current_importer_ids())
    )
  );

drop policy if exists fsvp_reassessment_outcomes_tenant_write on fsvp_reassessment_outcomes;
create policy fsvp_reassessment_outcomes_tenant_write on fsvp_reassessment_outcomes
  for all to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_reassessments fr
      where fr.id = reassessment_id
        and fr.importer_id in (select public.current_importer_ids())
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from fsvp_reassessments fr
      where fr.id = reassessment_id
        and fr.importer_id in (select public.current_importer_ids())
    )
  );

drop policy if exists background_reference_admin_read on background_reference_documents;
create policy background_reference_admin_read on background_reference_documents
  for select to authenticated
  using (true);

drop policy if exists background_reference_admin_write on background_reference_documents;
create policy background_reference_admin_write on background_reference_documents
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists supplier_documents_read on storage.objects;
create policy supplier_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'supplier-documents'
    and (public.is_platform_admin() or split_part(name, '/', 1)::uuid in (select public.current_importer_ids()))
  );

drop policy if exists supplier_documents_write on storage.objects;
create policy supplier_documents_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'supplier-documents'
    and (public.is_platform_admin() or split_part(name, '/', 1)::uuid in (select public.current_importer_ids()))
  );

drop policy if exists background_documents_read on storage.objects;
create policy background_documents_read on storage.objects
  for select to authenticated
  using (bucket_id = 'background-documents');

drop policy if exists background_documents_admin_write on storage.objects;
create policy background_documents_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'background-documents' and public.is_platform_admin())
  with check (bucket_id = 'background-documents' and public.is_platform_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','supplier_facilities','supplier_products','readiness_assessments',
    'background_reference_documents'
  ] loop
    execute format(
      'drop trigger if exists trg_%I_updated_at on %I;
       create trigger trg_%I_updated_at before update on %I
       for each row execute function set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;
