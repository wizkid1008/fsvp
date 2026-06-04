-- 012_triggers_rls_seed.sql — updated_at triggers, RLS enables, role_permissions seed

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'importers','importer_users','qualified_individuals','foreign_suppliers','foods',
    'hazard_analyses','supplier_evaluations',
    'supplier_written_assurances','audit_substitution_assurances','customer_disclosure_assurances',
    'verification_activities','audit_details','corrective_actions','fsvp_reassessments',
    'recall_events','fda_inspections','documents','reminders','subscription_entitlements'
  ] loop
    execute format(
      'create trigger trg_%I_updated_at before update on %I
         for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- RLS enables (policies finalized before launch)
alter table importers                       enable row level security;
alter table importer_users                  enable row level security;
alter table importer_entry_identities       enable row level security;
alter table qualified_individuals           enable row level security;
alter table qi_credentials                  enable row level security;
alter table eligibility_attestations        enable row level security;
alter table foreign_suppliers               enable row level security;
alter table foods                           enable row level security;
alter table food_supply_chain_links         enable row level security;
alter table hazard_analyses                 enable row level security;
alter table hazard_analysis_hazards         enable row level security;
alter table supplier_evaluations            enable row level security;
alter table supplier_written_assurances     enable row level security;
alter table audit_substitution_assurances   enable row level security;
alter table customer_disclosure_assurances  enable row level security;
alter table verification_activities         enable row level security;
alter table audit_details                   enable row level security;
alter table sampling_test_results           enable row level security;
alter table verification_nonconformities    enable row level security;
alter table corrective_actions              enable row level security;
alter table fsvp_reassessments              enable row level security;
alter table fsvp_reassessment_outcomes      enable row level security;
alter table recall_events                   enable row level security;
alter table fda_inspections                 enable row level security;
alter table fda_inspection_observations     enable row level security;
alter table import_entries                  enable row level security;
alter table documents                       enable row level security;
alter table record_signatures               enable row level security;
alter table document_access_log             enable row level security;
alter table reminders                       enable row level security;
alter table notification_deliveries         enable row level security;
alter table fda_request_bundles             enable row level security;
alter table supplier_portal_tokens          enable row level security;
alter table supplier_portal_uploads         enable row level security;
alter table api_credentials                 enable row level security;
alter table subscription_entitlements       enable row level security;

-- Policy template — repeat per tenant-scoped table, parameterized by role for writes:
--   create policy <table>_tenant_read on <table>
--     for select to authenticated
--     using (importer_id in (
--       select importer_id from importer_users
--         where clerk_user_id = auth.jwt()->>'sub' and removed_at is null));

-- Seed: role → permission map
insert into role_permissions (role, permission) values
  ('owner','*'),
  ('admin','manage_users'),
  ('admin','manage_suppliers'),
  ('admin','manage_foods'),
  ('admin','manage_billing'),
  ('admin','sign_corrective_action'),
  ('qi','perform_hazard_analysis'),
  ('qi','perform_supplier_evaluation'),
  ('qi','perform_verification'),
  ('qi','perform_reassessment'),
  ('qi','sign_corrective_action'),
  ('contributor','draft_records'),
  ('contributor','upload_documents'),
  ('viewer','read');
