-- 032: Allow supplier_id to be set when currently NULL
--
-- The prevent_profile_role_escalation trigger locked supplier_id
-- unconditionally, blocking ensure_supplier_record_for_profile from
-- ever persisting an initial link. We now permit the transition
-- NULL → <value> while still blocking any subsequent change.

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

  new.role        := old.role;
  new.user_status := old.user_status;
  new.importer_id := old.importer_id;

  -- Allow setting supplier_id for the first time (NULL → value).
  -- Block any change once it is already set.
  if old.supplier_id is not null then
    new.supplier_id := old.supplier_id;
  end if;

  return new;
end;
$$;
