-- 009_reminders_notifications.sql — reminder rows, notification delivery log, FDA request bundles

create table reminders (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  reminder_type                   text not null check (reminder_type in (
                                    'vsi_annual_attestation','supplier_assurance_renewal',
                                    'audit_substitution_assurance_renewal','customer_assurance_renewal',
                                    'fsvp_reassessment','supplier_evaluation_due',
                                    'hazard_analysis_reassessment','verification_activity_due',
                                    'qi_credential_expiring','temporary_approval_expiring',
                                    'follow_up_audit_due','inspection_response_due','custom')),
  target_entity_type              text,
  target_entity_id                uuid,
  due_at                          timestamptz not null,
  first_notify_at                 timestamptz,
  last_notified_at                timestamptz,
  snooze_until                    timestamptz,
  dismissed_at                    timestamptz,
  completed_at                    timestamptz,
  status                          text not null default 'pending' check (status in
                                    ('pending','notified','snoozed','dismissed','completed','expired')),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
create index ix_reminders_due
  on reminders (importer_id, due_at)
  where status in ('pending','notified','snoozed');

create table notification_deliveries (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid references importers(id) on delete set null,
  reminder_id                     uuid references reminders(id) on delete set null,
  channel                         text not null default 'email' check (channel in ('email','sms','in_app')),
  template_key                    text not null,
  to_address                      text not null,
  subject                         text,
  provider_message_id             text,
  target_entity_type              text,
  target_entity_id                uuid,
  sent_at                         timestamptz,
  delivered_at                    timestamptz,
  opened_at                       timestamptz,
  bounced_at                      timestamptz,
  bounce_reason                   text,
  failed_at                       timestamptz,
  failure_reason                  text,
  created_at                      timestamptz not null default now()
);
create index ix_notif_target on notification_deliveries (target_entity_type, target_entity_id);
create index ix_notif_message_id on notification_deliveries (provider_message_id) where provider_message_id is not null;

create table fda_request_bundles (
  id                              uuid primary key default gen_random_uuid(),
  importer_id                     uuid not null references importers(id) on delete cascade,
  inspection_id                   uuid references fda_inspections(id),
  requested_by_user_id            uuid not null references importer_users(id),
  scope_filters_json              jsonb not null,
  inspector_name                  text,
  inspector_request_text          text,
  bundle_document_id              uuid references documents(id),
  generated_at                    timestamptz,
  status                          text not null default 'generating' check (status in
                                    ('generating','ready','expired','failed')),
  created_at                      timestamptz not null default now()
);
