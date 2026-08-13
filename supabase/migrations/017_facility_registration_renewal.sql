-- ============================================================================
-- 017: FDA facility registration renewal (roadmap Phase 2, item 11)
--
-- 21 CFR 1.230 requires a food facility to renew its FDA registration between
-- 1 October and 31 December of every even-numbered year. A registration not
-- renewed in that window expires, and § 1.225 makes offering food for import
-- from an unregistered facility a prohibited act — the entry is refused.
--
-- facilities_verify has carried `fda_registration_number` since the baseline as
-- a bare string with no dates. So the platform could show a registration number
-- for a facility whose registration lapsed two years ago, and the first anyone
-- would learn of it is a refusal at the port. The number proves the facility
-- registered once; it says nothing about now.
--
-- This adds the date, the alert, and nothing else. Deliberately no separate
-- registrations table: the renewal window is fixed by regulation rather than by
-- the individual registration — every facility in the country renews in the
-- same quarter — so one current expiry date per facility is the whole state.
-- History, when it is wanted, belongs in audit_logs like every other change.
--
-- Pairs with lib/fsvp/facility-registration.ts, which computes the same window
-- for the UI, and with 016's delivery layer, which is what makes the alert
-- reach a person rather than sit in a table.
--
-- Safe to apply: one nullable column, one CHECK widened, one function replaced.
-- Existing rows get NULL, which reads as "renewal date unknown" — accurate,
-- since it was never recorded.
-- ============================================================================

begin;

-- ── 1. The date ─────────────────────────────────────────────────────────────

alter table facilities_verify
  add column if not exists fda_registration_expires_on date;

comment on column facilities_verify.fda_registration_expires_on is
  'Last date the FDA food facility registration is valid — 31 December of the '
  'even year it was last renewed in (21 CFR 1.230). NULL means the renewal date '
  'has never been recorded, which is NOT the same as current.';

create index if not exists ix_facilities_registration_expiry
  on facilities_verify (fda_registration_expires_on)
  where fda_registration_expires_on is not null;

-- ── 2. A new alert type ─────────────────────────────────────────────────────

alter table compliance_alerts
  drop constraint if exists compliance_alerts_alert_type_check;

alter table compliance_alerts
  add constraint compliance_alerts_alert_type_check
  check (alert_type in (
    'reassessment_due', 'verification_due', 'document_expiring',
    'corrective_action_open', 'supplier_approval_due', 'entry_filing_pending',
    'facility_registration_due'
  ));

-- ── 3. Sweep for registrations approaching or past their window ─────────────

create or replace function public.generate_facility_registration_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created int := 0;
  r         record;
begin
  for r in
    select f.id, f.facility_name, f.fda_registration_expires_on as expires_on,
           s.company_name, rel.importer_id
    from facilities_verify f
    join suppliers s on s.id = f.supplier_id
    -- Alerts are per importer, and a facility reaches an importer through the
    -- exporter it belongs to. A facility no importer is linked to raises
    -- nothing, because there is nobody it would be actionable for.
    join supplier_relationships rel
      on rel.supplier_id = f.supplier_id
     and rel.relationship_type = 'importer_supplier'
     and rel.status in ('active', 'pending_invite')
    where f.fda_registration_number is not null
      and f.fda_registration_expires_on is not null
      -- 90 days ahead of expiry: the window opens 1 October, so a facility
      -- expiring 31 December is warned from early October, with the whole
      -- window left to act in.
      and f.fda_registration_expires_on <= current_date + 90
      and not exists (
        select 1 from compliance_alerts a
        where a.alert_type = 'facility_registration_due'
          and a.importer_id = rel.importer_id
          and a.due_date = f.fda_registration_expires_on
          and a.status in ('open', 'acknowledged')
      )
  loop
    insert into compliance_alerts (
      importer_id, alert_type, title, description, due_date, severity
    ) values (
      r.importer_id,
      'facility_registration_due',
      'FDA registration renewal — ' || r.facility_name,
      r.company_name || ' must renew this facility''s FDA registration between '
        || '1 October and 31 December (21 CFR 1.230). Food from an unregistered '
        || 'facility may not be offered for import.',
      r.expires_on,
      case when r.expires_on < current_date then 'critical' else 'high' end
    );
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

comment on function public.generate_facility_registration_alerts() is
  'Biennial FDA registration renewal sweep (21 CFR 1.230). Idempotent — deduped '
  'on importer + due_date while an alert is open. Called by '
  'generate_compliance_alerts().';

-- ── 4. Fold it into the daily sweep ─────────────────────────────────────────
--
-- Appended rather than inlined so the existing three branches keep their own
-- shape and this one can be read, tested and changed on its own.

create or replace function public.generate_compliance_alerts_all()
returns integer
language sql
security definer
set search_path = public
as $$
  select public.generate_compliance_alerts()
       + public.generate_facility_registration_alerts();
$$;

comment on function public.generate_compliance_alerts_all() is
  'Every alert sweep, summed. The cron calls this; generate_compliance_alerts() '
  'is left untouched so migration 003 stays readable on its own terms.';

commit;
