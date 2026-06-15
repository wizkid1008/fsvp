-- 031: Fix supplier auto-link trigger (AFTER → BEFORE INSERT)
--
-- Migration 026 registered the trigger as AFTER INSERT, so the
-- `new.supplier_id :=` assignment in the trigger function was a
-- no-op (AFTER triggers cannot modify the new row via RETURN NEW).
-- Switching to BEFORE INSERT makes the assignment take effect and
-- prevents a redundant UPDATE round-trip.
--
-- Also back-fills any profiles that slipped through with null supplier_id.

-- ── 1. Replace trigger as BEFORE INSERT ──────────────────────────────────────

DROP TRIGGER IF EXISTS trg_auto_link_supplier_profile ON profiles;

CREATE TRIGGER trg_auto_link_supplier_profile
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_link_supplier_profile();

-- ── 2. Back-fill profiles still missing a supplier_id ────────────────────────

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT id
    FROM profiles
    WHERE role = 'supplier'
      AND supplier_id IS NULL
  LOOP
    PERFORM public.ensure_supplier_record_for_profile(p.id);
  END LOOP;
END $$;
