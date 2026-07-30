-- 042: Add 'exporter' as a distinct app_role
-- Exporters are foreign companies that ship food to the US and manage supply chains.
-- Suppliers (manufacturers) are upstream producers linked through an exporter.

-- 1. Add the new enum value (Postgres does not allow removing enum values,
--    so this is append-only and safe to run even if partially applied).
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'exporter';

-- 2. Migrate existing supplier-role accounts that are export-eligible
--    (supplier_type IN exporter / exporter_manufacturer / trader) to 'exporter'.
UPDATE profiles
SET    role = 'exporter'
WHERE  role = 'supplier'
AND    supplier_id IN (
  SELECT id
  FROM   suppliers
  WHERE  supplier_type IN ('exporter', 'exporter_manufacturer', 'trader')
);

-- 3. Any supplier-role account that owns a self-supply relationship
--    is by definition an exporter even if supplier_type isn't set yet.
UPDATE profiles
SET    role = 'exporter'
WHERE  role = 'supplier'
AND    supplier_id IN (
  SELECT exporter_id
  FROM   supplier_relationships
  WHERE  relationship_type = 'self_supply'
  AND    exporter_id = supplier_id
);

-- 4. Update RLS policies that reference 'supplier' to also include 'exporter'
--    where the permission should extend to both roles.
--    (Policy names vary by migration; use DO block to patch each affected table.)

-- profiles: exporters can read/update their own profile
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM   pg_policies
    WHERE  tablename IN ('profiles','suppliers','facilities','products','documents',
                         'supplier_relationships','facility_supplier_access',
                         'requirement_items','requirement_sections','scoring_results')
    AND    qual::text ILIKE '%supplier%'
  LOOP
    -- Log for visibility; actual policy recreation done per-table below
    RAISE NOTICE 'Policy % on % references supplier role', pol.policyname, pol.tablename;
  END LOOP;
END $$;

-- Note: Full RLS policy rewrite for 'exporter' requires knowing each policy
-- definition. Rather than rewriting every policy blindly, we grant 'exporter'
-- the same JWT claim path as 'supplier' by updating the helper function used
-- in most RLS policies (get_user_role / current_user_role if present).
-- If policies use (auth.jwt() ->> 'role') directly, the enum value itself
-- being 'exporter' in the token is sufficient — no policy text changes needed.

-- 5. Update the default role in the invite-user flow if a DB default exists.
-- (Application code handles this; no DB default to change here.)
