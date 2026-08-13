-- ============================================================================
-- 016: Let compliance alerts be delivered exactly once
--
-- generate_compliance_alerts() (migration 003) has been finding reassessments
-- falling due, documents about to expire and corrective actions left open, and
-- writing a compliance_alerts row for each. Nothing read that table — zero
-- application references — so the sweep has been running into a void. The
-- platform knew a certificate was lapsing and told nobody.
--
-- lib/notifications/deliver-alerts.ts now fans those rows out through notify(),
-- which is the same path every event-driven notification already takes and
-- which the header bell already reads. It needs one column to know what it has
-- already sent.
--
-- Dedupe lives HERE, on the alert, rather than in app_notifications. A tenant
-- with twelve users produces twelve notification rows per alert, so asking
-- "have I already told them" of that table means asking a question with twelve
-- answers. The alert is the thing that happened once.
--
-- Safe to apply: additive, nullable, no default backfill. Existing open alerts
-- have notified_at NULL and will therefore be delivered on the next run, which
-- is the correct behaviour — they were never delivered at all.
-- ============================================================================

begin;

alter table compliance_alerts
  add column if not exists notified_at timestamptz;

comment on column compliance_alerts.notified_at is
  'When this alert was fanned out to app_notifications. NULL means undelivered. '
  'Set by lib/notifications/deliver-alerts.ts after sending, never by the '
  'generating sweep — creation and delivery are separately idempotent.';

-- The delivery query is "open and never notified, oldest due date first". A
-- partial index keeps it cheap as resolved alerts accumulate, since those are
-- exactly the rows it never wants.
create index if not exists ix_compliance_alerts_undelivered
  on compliance_alerts (due_date)
  where status = 'open' and notified_at is null;

commit;
