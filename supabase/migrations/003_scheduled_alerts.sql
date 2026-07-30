-- ============================================================================
-- 003_scheduled_alerts.sql — date-driven compliance alerts and notifications
--
-- Cloudflare Pages has no cron, and the date logic already lives in the
-- database, so this runs as a Postgres function scheduled with pg_cron rather
-- than as a second deployment target.
--
-- Generates, once per day:
--   · reassessment due within 30 days, and overdue
--   · documents expiring within 60 days
--   · corrective actions open longer than 14 days
--
-- compliance_alerts is the dedupe ledger: an open alert for the same entity and
-- type is never duplicated, so the job is safe to run repeatedly.
--
-- If pg_cron is unavailable the function is still created and the schedule is
-- skipped with a notice — call public.generate_compliance_alerts() from
-- anywhere (a Supabase scheduled function, an external cron, or by hand).
-- ============================================================================

begin;

create or replace function public.generate_compliance_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created int := 0;
  r         record;
begin

  -- ── 1. Reassessment due ──────────────────────────────────────────────────
  for r in
    select f.id, f.importer_id, f.reassessment_due_at::date as due,
           s.company_name, p.product_name
    from fsvp_records f
    join suppliers s        on s.id = f.supplier_id
    join products_verify p  on p.id = f.product_id
    where f.reassessment_due_at is not null
      and f.reassessment_due_at::date <= current_date + 30
      and f.status in ('importer_approved', 'conditionally_approved')
      and not exists (
        select 1 from compliance_alerts a
        where a.fsvp_record_id = f.id
          and a.alert_type = 'reassessment_due'
          and a.status in ('open', 'acknowledged')
      )
  loop
    insert into compliance_alerts (
      importer_id, fsvp_record_id, alert_type, title, description, due_date, severity
    ) values (
      r.importer_id, r.id, 'reassessment_due',
      format('Reassessment due: %s — %s', r.company_name, r.product_name),
      case when r.due < current_date
           then 'This FSVP record is overdue for reassessment under § 1.505(c).'
           else 'This FSVP record is due for reassessment within 30 days.' end,
      r.due,
      case when r.due < current_date then 'critical' else 'high' end
    );

    insert into app_notifications (
      importer_id, recipient_profile_id, notification_type, title, body, target_url, severity
    )
    select r.importer_id, pr.id, 'reassessment_due',
           format('Reassessment due: %s', r.product_name),
           format('%s — due %s.', r.company_name, to_char(r.due, 'DD Mon YYYY')),
           '/fsvp-records/' || r.id,
           case when r.due < current_date then 'critical' else 'warning' end
    from profiles pr
    where pr.importer_id = r.importer_id and pr.user_status = 'active';

    v_created := v_created + 1;
  end loop;

  -- ── 2. Documents expiring ────────────────────────────────────────────────
  for r in
    select d.id, d.importer_id, d.supplier_id, d.title, d.expiration_date as due,
           s.company_name
    from documents d
    left join suppliers s on s.id = d.supplier_id
    where d.expiration_date is not null
      and d.soft_deleted_at is null
      and d.evidence_status = 'accepted'
      and d.expiration_date <= current_date + 60
      and d.importer_id is not null
      and not exists (
        select 1 from compliance_alerts a
        where a.document_id = d.id
          and a.alert_type = 'document_expiring'
          and a.status in ('open', 'acknowledged')
      )
  loop
    insert into compliance_alerts (
      importer_id, document_id, alert_type, title, description, due_date, severity
    ) values (
      r.importer_id, r.id, 'document_expiring',
      format('Expiring: %s', r.title),
      format('%s expires %s. Request a current version from %s.',
             r.title, to_char(r.due, 'DD Mon YYYY'), coalesce(r.company_name, 'the supplier')),
      r.due,
      case when r.due < current_date then 'critical'
           when r.due <= current_date + 30 then 'high'
           else 'medium' end
    );

    insert into app_notifications (
      importer_id, supplier_id, recipient_profile_id, notification_type, title, body, target_url, severity
    )
    select r.importer_id, r.supplier_id, pr.id, 'document_expiring',
           format('Document expiring: %s', r.title),
           format('Expires %s.', to_char(r.due, 'DD Mon YYYY')),
           '/importer-review',
           case when r.due <= current_date + 30 then 'warning' else 'info' end
    from profiles pr
    where pr.importer_id = r.importer_id and pr.user_status = 'active';

    v_created := v_created + 1;
  end loop;

  -- ── 3. Corrective actions open too long ──────────────────────────────────
  for r in
    select c.id, c.importer_id, c.issue_description, c.triggered_at::date as opened,
           s.company_name
    from corrective_actions c
    join suppliers s on s.id = c.supplier_id
    where c.status in ('open', 'in_progress')
      and c.triggered_at < now() - interval '14 days'
      and not exists (
        select 1 from compliance_alerts a
        where a.alert_type = 'corrective_action_open'
          and a.status in ('open', 'acknowledged')
          and a.description = c.issue_description
          and a.importer_id = c.importer_id
      )
  loop
    insert into compliance_alerts (
      importer_id, alert_type, title, description, due_date, severity
    ) values (
      r.importer_id, 'corrective_action_open',
      format('Corrective action unresolved: %s', r.company_name),
      r.issue_description,
      r.opened + 14,
      'high'
    );
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

comment on function public.generate_compliance_alerts() is
  'Daily compliance calendar sweep. Idempotent — compliance_alerts is the dedupe '
  'ledger, so an open alert for the same entity and type is never duplicated.';

-- ── Schedule it, if pg_cron is available ───────────────────────────────────
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    -- Replace any previous definition of this job.
    perform cron.unschedule(jobid)
    from cron.job where jobname = 'fsvp_compliance_alerts';

    perform cron.schedule(
      'fsvp_compliance_alerts',
      '0 7 * * *',                       -- 07:00 UTC daily
      $cron$select public.generate_compliance_alerts();$cron$
    );

    raise notice 'Scheduled fsvp_compliance_alerts daily at 07:00 UTC.';
  else
    raise notice 'pg_cron is not available. generate_compliance_alerts() was created but is NOT scheduled — invoke it from an external scheduler.';
  end if;
exception when others then
  raise notice 'Could not schedule via pg_cron (%). The function exists and can be called manually.', sqlerrm;
end $$;

commit;
