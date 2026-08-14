-- ============================================================================
-- 019: Make the rule review schedule reach a person
--
-- docs/reference-layer-curation.md, § 3.4, names this gap in its own words:
--
--   "Review scheduling and alerting — already in the schema: review_due_at,
--    rule_is_current(), and the country_commodity_rules_status view. What is
--    missing is a screen and a notification. WITHOUT THOSE, THE REVIEW DATING
--    IS A MECHANISM NOBODY CAN ACT ON, and the whole design rests on someone
--    actually re-checking."
--
-- The whole reference layer rests on one claim: a rule that has not been
-- re-checked must not be presented as authoritative. review_due_at is what
-- makes that claim keepable — but a date nobody sees keeps nothing. This adds
-- the one column the notification needs to avoid repeating itself.
--
-- Deliberately NOT a compliance_alerts row. That table's importer_id is NOT
-- NULL, and a country-commodity rule belongs to no tenant — it is platform
-- reference data and re-checking it is an administrator's job. Attributing it
-- to some arbitrary importer would put platform work in a customer's queue.
-- The notification goes to app_notifications instead, whose importer_id is
-- nullable, via notifyPlatformAdmins() in lib/notifications/notify.ts.
--
-- Safe to apply: one nullable column on a table that is currently empty.
-- ============================================================================

begin;

alter table country_commodity_rules
  add column if not exists review_notified_at timestamptz;

comment on column country_commodity_rules.review_notified_at is
  'When an administrator was last told this rule needs re-checking. Stops the '
  'daily sweep re-raising the same rule every morning — see RENOTIFY_AFTER_DAYS '
  'in lib/regulatory/rule-review.ts. NULL means never notified.';

-- Partial: the sweep only ever looks at rules still in force, and a superseded
-- rule is history that nothing resolves against.
create index if not exists ix_rules_review_notified
  on country_commodity_rules (review_due_at, review_notified_at)
  where superseded_at is null;

commit;
