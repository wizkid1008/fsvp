-- ============================================================================
-- 010_suspension_assurances_verification.sql — the four gaps that let a record
-- look complete while the regulation was not satisfied.
--
-- Roadmap Phase 1 item 4. Each piece closes a place where the platform held a
-- word but not the thing the word stands for:
--
--   1. SUSPENSION was a value in a dropdown. Nothing read it. An importer could
--      suspend a supplier and still approve their FSVP record the same minute.
--   2. WRITTEN ASSURANCES under § 1.507 had nowhere to live, so an importer
--      relying on a customer to control a hazard had no record of the assurance
--      the regulation requires them to obtain and renew annually.
--   3. THE VERIFICATION DETERMINATION was one free-text column. § 1.506(d)(1)(i)
--      requires the importer to determine and document WHICH activities are
--      needed and why, and § 1.506(d)(2) requires an annual onsite audit where
--      the supplier controls a SAHCODHA hazard unless an adequate written
--      determination says otherwise. Prose cannot be checked for either.
--   4. REASSESSMENT was time-driven only. § 1.508(b) also requires reassessment
--      when the importer becomes aware of new information about the hazards or
--      the supplier's performance — which is precisely when it matters.
-- ============================================================================

begin;

-- ── 1. Suspension ──────────────────────────────────────────────────────────
-- Per importer, not per supplier. `suppliers` is a global entity shared between
-- importers (see the header of section 6 in 000_baseline.sql), so writing
-- suspension onto the supplier row would let one importer's decision suspend a
-- firm for everybody else buying from them. Suspension is a commercial and
-- food-safety judgement one importer makes about their own relationship.
--
-- Kept as its own table rather than a status column so the history survives:
-- that a supplier was suspended for four months in 2025 and reinstated is
-- exactly what an FDA investigator asks about, and a column would overwrite it.

create table supplier_suspensions (
  id                    uuid primary key default gen_random_uuid(),
  importer_id           uuid not null references importers(id) on delete cascade,
  supplier_id           uuid not null references suppliers(id) on delete cascade,

  -- Enumerated so the reason can be reasoned about and reported on, with a
  -- free-text detail alongside rather than instead.
  basis                 text not null check (basis in (
                          'verification_failure',     -- § 1.506 activity came back unacceptable
                          'corrective_action_open',   -- § 1.508(c) issue unresolved
                          'regulatory_finding',       -- FDA action, refusal, recall (migration 009)
                          'evidence_lapsed',          -- required records expired and not renewed
                          'commercial',               -- importer's own commercial decision
                          'other'
                        )),
  reason                text not null,

  suspended_at          timestamptz not null default now(),
  suspended_by_profile_id uuid not null references profiles(id) on delete restrict,

  -- Lifting is a decision in its own right and needs its own reasoning. A
  -- suspension that can be silently cleared is not a control.
  lifted_at             timestamptz,
  lifted_by_profile_id  uuid references profiles(id) on delete set null,
  lift_rationale        text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint suspension_lift_complete check (
    (lifted_at is null and lifted_by_profile_id is null and lift_rationale is null)
    or (lifted_at is not null and lifted_by_profile_id is not null and lift_rationale is not null)
  )
);

-- One live suspension per importer/supplier pair; lifted ones accumulate.
create unique index ux_supplier_suspension_live
  on supplier_suspensions (importer_id, supplier_id)
  where lifted_at is null;

create index ix_supplier_suspension_supplier on supplier_suspensions (supplier_id)
  where lifted_at is null;

-- ── 2. Written assurances (§ 1.507) ────────────────────────────────────────
-- When a hazard requiring a control is not controlled before the food reaches
-- the US, § 1.507 lets the importer rely on a customer or a downstream entity
-- instead — but only against a written assurance, renewed at least annually,
-- carrying an effective date and the signature of an authorised official
-- (§ 1.507(b)).
--
-- The category is enumerated because each one requires a DIFFERENT assurance,
-- and the wrong one is worthless: an assurance that a customer follows
-- preventive-control procedures does not substitute for one that the food will
-- be processed to control the hazard further down the chain.

create table written_assurances (
  id                    uuid primary key default gen_random_uuid(),
  importer_id           uuid not null references importers(id) on delete cascade,
  supplier_id           uuid references suppliers(id) on delete set null,
  product_id            uuid references products_verify(id) on delete set null,
  fsvp_record_id        uuid references fsvp_records(id) on delete cascade,

  category              text not null check (category in (
                          -- § 1.507(a)(2): customer subject to part 117/507 preventive controls
                          'customer_preventive_controls',
                          -- § 1.507(a)(3): customer not subject to those requirements
                          'customer_food_safety_compliance',
                          -- § 1.507(a)(4): entity further down the distribution chain
                          'downstream_processing',
                          -- § 1.507(a)(1): raw agricultural commodity, no assurance required
                          'rac_no_assurance_required',
                          -- § 1.507(a)(5): the importer controls the hazard itself
                          'importer_controlled'
                        )),
  -- Written server-side from lib/fsvp/assurances.ts, never taken from the
  -- client, so an assurance cannot cite a paragraph that does not say what it
  -- claims. Same rule as applicability determinations in 008.
  citation              text not null,

  -- Who gave it. Null for the two categories that require no counterparty.
  counterparty_name     text,
  counterparty_role     text,
  signatory_name        text,
  signatory_title       text,

  -- What it covers, and the hazard it is standing in for.
  food_scope            text not null,
  hazard_description    text,
  assurance_text        text not null,

  -- § 1.507(b): an assurance carries an effective date. The reliance paragraphs
  -- of § 1.507(a) each require it renewed at least annually, so expiry is
  -- required rather than optional — an assurance with no end date would
  -- silently become permanent.
  effective_from        date not null default current_date,
  expires_at            date not null,

  document_id           uuid references documents(id) on delete set null,

  superseded_at         timestamptz,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint assurance_period check (expires_at > effective_from),

  -- The three categories that rely on somebody else must name them. The two
  -- that do not rely on anyone must not, so a record cannot imply an assurance
  -- it never obtained.
  constraint assurance_counterparty check (
    (category in ('customer_preventive_controls', 'customer_food_safety_compliance', 'downstream_processing')
      and counterparty_name is not null and signatory_name is not null)
    or (category in ('rac_no_assurance_required', 'importer_controlled')
      and counterparty_name is null)
  )
);

create index ix_assurance_record on written_assurances (fsvp_record_id)
  where superseded_at is null;
create index ix_assurance_expiry on written_assurances (expires_at)
  where superseded_at is null;

-- ── 3. Verification activity determination (§ 1.506(d)) ────────────────────
-- § 1.506(d)(1)(i) requires the importer to determine and document which
-- verification activities are needed, considering the § 1.505 evaluation.
-- § 1.506(d)(2) then requires an onsite audit before first import and at least
-- annually where the foreign supplier controls a hazard with a reasonable
-- probability of serious adverse health consequences or death — unless there is
-- an ADEQUATE WRITTEN DETERMINATION that other activities are appropriate.
--
-- The structure exists so the second rule can be enforced. As free text it was
-- unenforceable: nothing could tell an importer who had justified an
-- alternative from one who had simply not thought about it.

create table verification_determinations (
  id                    uuid primary key default gen_random_uuid(),
  importer_id           uuid not null references importers(id) on delete cascade,
  fsvp_record_id        uuid not null references fsvp_records(id) on delete cascade,

  -- Which activities were chosen, from the § 1.506(e)(1) list.
  activities            text[] not null check (
                          array_length(activities, 1) >= 1
                          and activities <@ array[
                            'onsite_audit', 'sampling_testing', 'records_review',
                            'other_appropriate_activity'
                          ]::text[]
                        ),
  frequency_notes       text not null,

  -- § 1.506(d)(1)(i) factors, each recorded rather than assumed. Free text per
  -- factor because the regulation asks for consideration, not a checkbox — but
  -- named individually so a blank one is visible.
  hazard_analysis_basis        text not null,
  supplier_performance_basis   text not null,
  food_and_supplier_risk_basis text not null,
  storage_and_transport_basis  text,

  -- § 1.506(d)(2): the SAHCODHA rule.
  sahcodha_hazard_present      boolean not null default false,
  -- Only meaningful when a SAHCODHA hazard exists: does the FOREIGN SUPPLIER
  -- control it, or is it controlled elsewhere?
  controlled_by_foreign_supplier boolean not null default false,
  annual_onsite_audit_performed  boolean not null default false,
  -- The "adequate written determination" the regulation allows in place of the
  -- annual audit. Enforced below: it is required exactly when the audit is not
  -- being done and the rule would otherwise demand it.
  alternative_justification    text,

  determined_at         timestamptz not null default now(),
  qualified_individual_id uuid not null references qualified_individuals(id) on delete restrict,
  superseded_at         timestamptz,
  created_by_profile_id uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index ux_verification_determination_live
  on verification_determinations (fsvp_record_id)
  where superseded_at is null;

-- The § 1.506(d)(2) rule, enforced in the database as well as the API because
-- it is the single substantive control in this migration: where the supplier
-- controls a hazard that can kill someone, either you audit them annually or
-- you write down why you do not.
create or replace function public.enforce_sahcodha_audit_rule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sahcodha_hazard_present
     and new.controlled_by_foreign_supplier
     and not new.annual_onsite_audit_performed
     and (new.alternative_justification is null or btrim(new.alternative_justification) = '')
  then
    raise exception
      '21 CFR 1.506(d)(2): this foreign supplier controls a hazard with a reasonable probability '
      'of serious adverse health consequences or death. That requires an onsite audit before first '
      'import and at least annually, unless you record an adequate written determination that other '
      'verification activities are appropriate. Record the audit or the justification.';
  end if;

  return new;
end;
$$;

create trigger trg_sahcodha_audit_rule
  before insert or update on verification_determinations
  for each row execute function public.enforce_sahcodha_audit_rule();

-- ── 4. Event-driven reassessment (§ 1.508(b)) ──────────────────────────────
-- § 1.508(a) sets the three-year clock. § 1.508(b) is the one that matters
-- operationally: reassess promptly when new information about the hazards or
-- the supplier's performance comes to light. Recording WHAT triggered a
-- reassessment is what makes the reassessment defensible later.

create table reassessment_triggers (
  id                    uuid primary key default gen_random_uuid(),
  importer_id           uuid not null references importers(id) on delete cascade,
  fsvp_record_id        uuid not null references fsvp_records(id) on delete cascade,

  trigger_type          text not null check (trigger_type in (
                          'corrective_action_opened',
                          'verification_unacceptable',
                          'regulatory_finding_confirmed',
                          'supplier_suspended',
                          'assurance_expired',
                          'manual'
                        )),
  -- What set it off, so the reassessment can start from the actual event.
  source_table          text,
  source_id             uuid,
  detail                text not null,

  triggered_at          timestamptz not null default now(),
  -- Cleared when a reassessment covering this trigger is completed.
  resolved_at           timestamptz,
  resolved_by_reassessment_id uuid references fsvp_reassessments(id) on delete set null,

  created_at            timestamptz not null default now()
);

create index ix_reassessment_trigger_open
  on reassessment_triggers (importer_id, fsvp_record_id)
  where resolved_at is null;

-- Raising a trigger also moves the record into reassessment_due. Done in the
-- database so that every path which opens a corrective action or records an
-- unacceptable verification result gets it, including ones written later that
-- forget to call the helper.
create or replace function public.apply_reassessment_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update fsvp_records
     set status = 'reassessment_due'
   where id = new.fsvp_record_id
     -- Never override a terminal decision: a rejected record does not need
     -- reassessing, and an approved one is exactly what we DO want flagged.
     and status in (
       'importer_approved', 'conditionally_approved', 'supplier_evidence_accepted',
       'importer_review_pending'
     );

  update reassessment_schedules
     set status = 'overdue', next_due_at = least(next_due_at, now())
   where fsvp_record_id = new.fsvp_record_id
     and status = 'scheduled';

  return new;
end;
$$;

create trigger trg_apply_reassessment_trigger
  after insert on reassessment_triggers
  for each row execute function public.apply_reassessment_trigger();

-- An unacceptable verification result is new information about the supplier's
-- performance, which is § 1.508(b) on its face. Raised here rather than in the
-- API so it cannot be forgotten by a future caller.
create or replace function public.trigger_reassessment_on_verification()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_importer uuid;
begin
  if new.result = 'unacceptable'
     and (tg_op = 'INSERT' or old.result is distinct from new.result)
  then
    select importer_id into v_importer from fsvp_records where id = new.fsvp_record_id;

    if v_importer is not null then
      insert into reassessment_triggers
        (importer_id, fsvp_record_id, trigger_type, source_table, source_id, detail)
      values
        (v_importer, new.fsvp_record_id, 'verification_unacceptable',
         'fsvp_verification_records', new.id,
         format('A %s verification activity returned an unacceptable result.',
                replace(new.activity_type, '_', ' ')));
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_verification_unacceptable
  after insert or update on fsvp_verification_records
  for each row execute function public.trigger_reassessment_on_verification();

-- Opening a corrective action is the other clear § 1.508(b) event.
create or replace function public.trigger_reassessment_on_corrective_action()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.fsvp_record_id is not null and new.status <> 'closed' then
    insert into reassessment_triggers
      (importer_id, fsvp_record_id, trigger_type, source_table, source_id, detail)
    values
      (new.importer_id, new.fsvp_record_id, 'corrective_action_opened',
       'corrective_actions', new.id,
       left(coalesce(new.issue_description, 'A corrective action was opened.'), 500));
  end if;

  return new;
end;
$$;

create trigger trg_corrective_action_reassessment
  after insert on corrective_actions
  for each row execute function public.trigger_reassessment_on_corrective_action();

-- ── updated_at ─────────────────────────────────────────────────────────────

create trigger trg_suspension_updated_at
  before update on supplier_suspensions
  for each row execute function public.set_updated_at();
create trigger trg_assurance_updated_at
  before update on written_assurances
  for each row execute function public.set_updated_at();
create trigger trg_verification_determination_updated_at
  before update on verification_determinations
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table supplier_suspensions       enable row level security;
alter table written_assurances         enable row level security;
alter table verification_determinations enable row level security;
alter table reassessment_triggers      enable row level security;

-- A supplier may see that they are suspended by an importer they deal with —
-- unlike an evaluation narrative, a suspension is something they need to know
-- and will find out anyway. The reason is visible with it; a suspension whose
-- basis is hidden cannot be remedied.
create policy suspension_read on supplier_suspensions
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
    or supplier_id in (
      select supplier_id from profiles where id = auth.uid() and supplier_id is not null
    )
  );

create policy suspension_write on supplier_suspensions
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

create policy assurance_read on written_assurances
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

create policy assurance_write on written_assurances
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

create policy verification_determination_read on verification_determinations
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

create policy verification_determination_write on verification_determinations
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

create policy reassessment_trigger_read on reassessment_triggers
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_platform_reviewer()
    or importer_id in (select public.current_importer_ids())
  );

create policy reassessment_trigger_write on reassessment_triggers
  for all to authenticated
  using (public.is_platform_admin() or importer_id in (select public.current_importer_ids()))
  with check (public.is_platform_admin() or importer_id in (select public.current_importer_ids()));

commit;
