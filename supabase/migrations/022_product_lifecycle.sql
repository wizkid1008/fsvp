-- ============================================================================
-- 022: Products you do not import
--
-- products_verify has had no lifecycle at all — no active flag, no
-- discontinued state, not even a soft delete. Every row is a live import as far
-- as the platform is concerned, so a product created speculatively, or one no
-- longer sourced, sits in the setup path demanding a fix forever. The only two
-- options were "link it" or "live with it".
--
-- Deleting would be the wrong fix, and the reason is § 1.510. Records must be
-- kept for two years AFTER an importer stops importing from a supplier. So a
-- product that was once imported cannot simply vanish — but neither should it
-- keep appearing as outstanding work.
--
-- Three states, because the regulation distinguishes three situations:
--
--   active         Imported now. The full FSVP obligation applies.
--   not_imported   Never imported — created in error, or before a supplier
--                  relationship existed and never sourced. FSVP never attached,
--                  so there is nothing to retain.
--   discontinued   Was imported, no longer is. Records are retained for two
--                  years from the date importing stopped, and the product stops
--                  being outstanding work immediately.
--
-- The date matters as much as the state: the retention clock runs from when
-- importing stopped, not from when somebody got round to recording it.
--
-- Safe to apply: existing rows default to 'active', which is what they are
-- treated as today.
-- ============================================================================

begin;

alter table products_verify
  add column if not exists lifecycle text not null default 'active'
    check (lifecycle in ('active', 'not_imported', 'discontinued'));

-- When importing actually stopped. Null unless discontinued.
alter table products_verify
  add column if not exists discontinued_on date;

-- Who decided, and when they recorded it. This is a compliance decision about
-- what the organization does, not a tidy-up, so it is attributable.
alter table products_verify
  add column if not exists lifecycle_changed_at timestamptz;

alter table products_verify
  add column if not exists lifecycle_changed_by_profile_id uuid
    references profiles(id) on delete set null;

alter table products_verify
  add column if not exists lifecycle_reason text;

-- A discontinued product must say when importing stopped, because the § 1.510
-- retention period is measured from that date. Anything else must not carry one.
alter table products_verify
  drop constraint if exists products_lifecycle_date_check;

alter table products_verify
  add constraint products_lifecycle_date_check check (
    (lifecycle = 'discontinued' and discontinued_on is not null)
    or (lifecycle <> 'discontinued' and discontinued_on is null)
  );

comment on column products_verify.lifecycle is
  'Whether this food is imported now. Only "active" products carry an FSVP '
  'obligation or appear as outstanding work. "discontinued" retains records for '
  'two years from discontinued_on per 21 CFR 1.510; "not_imported" never '
  'attracted an obligation at all.';

comment on column products_verify.discontinued_on is
  'The date importing actually stopped — the § 1.510 retention clock runs from '
  'here, not from when the change was recorded.';

-- Nearly every query wants active products only, and this keeps that cheap.
create index if not exists ix_products_active
  on products_verify (supplier_id)
  where lifecycle = 'active';

-- Finding records whose retention has run out, when that work is built.
create index if not exists ix_products_discontinued
  on products_verify (discontinued_on)
  where lifecycle = 'discontinued';

commit;
