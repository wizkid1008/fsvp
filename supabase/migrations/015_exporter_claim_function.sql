-- ============================================================================
-- 015: Make claiming an exporter record actually work
--
-- THE BUG
--
-- app/api/exporters/claim/route.ts accepts a claim by updating profiles
-- through the service-role client:
--
--     .update({ supplier_id: supplier.id, role: "exporter", user_status: "active" })
--
-- The service-role key bypasses RLS. It does NOT bypass triggers.
-- trg_profiles_prevent_role_escalation is a BEFORE UPDATE trigger on profiles
-- whose only escape hatch is is_platform_admin(), which resolves auth.uid().
-- Under the service-role client auth.uid() is NULL, so the check fails and the
-- trigger reassigns every guarded column back to its old value:
--
--     new.role        := old.role;
--     new.user_status := old.user_status;
--     new.importer_id := old.importer_id;
--     if old.supplier_id is not null then new.supplier_id := old.supplier_id; end if;
--
-- Postgres raises nothing. The claim reports success and the claiming account
-- is never linked to the record it just claimed.
--
-- The same mechanism broke importer approval, fixed in ba421bc by switching
-- that route to the user-scoped client so auth.uid() is the administrator and
-- is_platform_admin() is true. That remedy does not work here: the actor is the
-- exporter claiming the record, and they are not an administrator.
--
-- It also breaks the stray-record cleanup earlier in the same route. Signing up
-- through an invite fires trg_auto_link_supplier_profile, which creates a
-- duplicate suppliers row and points the profile at it. The route tries to
-- unlink with `.update({ supplier_id: null })`, which the trigger reverts, then
-- deletes the duplicate. profiles.supplier_id is ON DELETE SET NULL, so the
-- delete performs its own UPDATE on profiles — which fires the same trigger,
-- which puts the reference back, leaving the row pointing at a supplier being
-- deleted. That delete is expected to fail on the foreign key, and its result
-- is not checked.
--
-- THE FIX
--
-- Two parts, and the first is the one that matters.
--
-- 1. The trigger gains a carve-out for code running inside a SECURITY DEFINER
--    function. Inside such a function current_user is the function's owner
--    while session_user remains the caller, so `session_user <> current_user`
--    is true there and false for any statement a client issues directly.
--    A client cannot fake it: it would have to already be able to execute a
--    function owned by another role, which is exactly the privilege this is
--    granting. This is deliberately NOT done with a set_config() flag — any
--    authenticated client could set that itself and then update its own
--    profile row (profiles' update policy permits id = auth.uid()), which would
--    turn a fix into a self-service route to role = 'administrator'.
--
-- 2. claim_exporter_record() performs the whole claim in one statement-level
--    transaction: validate the token, refuse a non-empty duplicate, drop an
--    empty one, transfer ownership, and link the profile. Doing it in the
--    database rather than across five round trips also removes the window
--    where ownership has transferred but the profile has not been linked.
--
-- NOT APPLIED AUTOMATICALLY. Review before running — it changes a trigger that
-- guards role escalation, which is the last thing that should change quietly.
-- ============================================================================

begin;

-- ── 1. Trigger carve-out ────────────────────────────────────────────────────

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

  -- Running inside a SECURITY DEFINER function: current_user is that
  -- function's owner, session_user is still the caller. Only reachable by
  -- code this schema installed, so the function itself is responsible for
  -- authorising the change. See claim_exporter_record below.
  if session_user is distinct from current_user then
    return new;
  end if;

  new.role        := old.role;
  new.user_status := old.user_status;
  new.importer_id := old.importer_id;

  if old.supplier_id is not null then
    new.supplier_id := old.supplier_id;
  end if;

  return new;
end;
$$;

-- ── 2. The claim itself ─────────────────────────────────────────────────────

-- Returns the claimed supplier id. Raises with a message safe to show a user.
create or replace function public.claim_exporter_record(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_supplier    suppliers%rowtype;
  v_profile     profiles%rowtype;
  v_stray_id    uuid;
  v_stray_count bigint;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to claim a record.'
      using errcode = '28000';
  end if;

  select * into v_supplier
  from suppliers
  where claim_invite_token = p_token
  for update;

  if not found then
    raise exception 'This invite is not valid, or has already been used.'
      using errcode = 'P0002';
  end if;

  select * into v_profile from profiles where id = v_user_id for update;

  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  -- Discard the duplicate row that trg_auto_link_supplier_profile created at
  -- signup, but only when nothing has been attached to it. Counting first, in
  -- one query per table, keeps the refusal message honest: we never delete a
  -- record that holds real data.
  if v_profile.supplier_id is not null and v_profile.supplier_id <> v_supplier.id then
    v_stray_id := v_profile.supplier_id;

    select
      (select count(*) from documents            where supplier_id = v_stray_id)
    + (select count(*) from products_verify      where supplier_id = v_stray_id)
    + (select count(*) from facilities_verify    where supplier_id = v_stray_id)
    + (select count(*) from supplier_relationships where supplier_id = v_stray_id)
    into v_stray_count;

    if v_stray_count > 0 then
      raise exception
        'Your account is already linked to a different company record that has data attached. Contact an administrator to merge the two rather than losing anything.'
        using errcode = '23505';
    end if;

    -- Unlink before deleting. Without this the FK's ON DELETE SET NULL fires
    -- its own UPDATE on profiles, and the ordering becomes harder to reason
    -- about than simply doing it ourselves.
    update profiles set supplier_id = null where id = v_user_id;
    delete from suppliers where id = v_stray_id;
  end if;

  -- Transfer ownership. managed_by_importer_id must be cleared in the same
  -- statement: suppliers_managed_by_check requires it null when self_managed.
  update suppliers
  set record_mode            = 'self_managed',
      managed_by_importer_id = null,
      claim_invite_token     = null,
      claimed_at             = now(),
      claim_declined_at      = null
  where id = v_supplier.id;

  -- role is normally already 'exporter' — trg_auto_link_supplier_profile sets
  -- it at insert — but it is asserted here so a profile that arrived by some
  -- other path ends up in the same state.
  update profiles
  set supplier_id = v_supplier.id,
      role        = 'exporter',
      user_status = 'active'
  where id = v_user_id;

  return v_supplier.id;
end;
$$;

revoke all on function public.claim_exporter_record(text) from public;
grant execute on function public.claim_exporter_record(text) to authenticated;

comment on function public.claim_exporter_record(text) is
  'Accepts an exporter record invite atomically. SECURITY DEFINER so it can set '
  'profiles.supplier_id/role/user_status past trg_profiles_prevent_role_escalation, '
  'which the claiming exporter cannot do directly and which the service-role '
  'client cannot do either — the trigger is not bypassed by the service key.';

commit;
