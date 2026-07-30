# In-place upgrade path

`045_importer_rebuild_in_place.sql` converges an **existing** database (migrations
001–043 applied, 044 never run) onto the same end state as the baseline, without
dropping the schema.

It lives here rather than in `supabase/migrations/` so that running the migrations
folder in lexical order on a fresh project never picks it up. The two paths are
mutually exclusive:

| Situation | Run |
|---|---|
| New / empty database | `migrations/000_baseline.sql` → `001_baseline_rls.sql` → `002_reference_data.sql` |
| Existing database, keep data and logins | `upgrade/045_importer_rebuild_in_place.sql` → `migrations/001_baseline_rls.sql` → `002_reference_data.sql` |

Both end at the same schema. `045` asserts that in its final section and raises if
they have drifted.

## Important

- `045` refuses to run against a database that already has `suppliers.record_mode`,
  so it cannot be applied twice or on top of the baseline.
- `045` **drops every RLS policy** in the `public` schema as its second-to-last step.
  RLS stays enabled, so the database fails closed. You must then run
  `migrations/001_baseline_rls.sql` to restore access.
- `002_reference_data.sql` is safe but optional on this path — every statement is
  `ON CONFLICT DO NOTHING/UPDATE` against reference data you already have.

## Rows that get deleted

`corrective_actions.supplier_id` and `readiness_assessments.supplier_id` are
`NOT NULL` and pointed at `foreign_suppliers`, which migration 034 dropped. Any row
whose `supplier_id` no longer resolves against `suppliers` is deleted so the
corrected foreign key can be added. Check the count first if you care:

```sql
select count(*) from corrective_actions c
where not exists (select 1 from suppliers s where s.id = c.supplier_id);
```
