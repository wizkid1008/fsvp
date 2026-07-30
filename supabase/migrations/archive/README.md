# Archived migrations (001–044)

These are the original incremental migrations, superseded on 2026-07-30 by
`../000_baseline.sql`, `../001_baseline_rls.sql`, and `../002_reference_data.sql`.

**Do not run these.** They are kept for reference only — several of them reference
tables that no longer exist, and running them against a baseline database will fail.

## Why they were collapsed

Migrations 001–013 modeled a broad FSVP/ITDS domain (hazard library, FDA inspections,
qualified individuals, subscription billing, `foreign_suppliers`, `foods`). Migration 014
replaced the supplier-facing half with the simpler model the app actually runs on, but the
importer half was never rebuilt to match — it was stubbed with an auto-link trigger that
assigned every importer account to the first `importers` row on the platform.

Roughly fifteen of the 44 migrations existed only to patch earlier ones:

| Chain | Files |
|---|---|
| Supplier profile auto-link | 026 → 031 → 032 |
| Products / facilities RLS | 019 → 020 → 037 → 039 |
| Supplier type and linking | 027 → 030 → 033 → 042 |
| Documents / suppliers RLS | 023 → 028 → 029 → 035 |
| Legacy cleanup (never applied) | 034, 044 |

Answering "what policy governs this table?" meant reading five files in order. The baseline
states the end result once.

## What changed in the collapse

Beyond flattening, these deliberate changes were made — see
`docs/importer-improvement-plan.md` for the reasoning:

- **Removed** `auto_link_importer` (was `017`). Importer organizations are now created by an
  administrator at account approval. Previously every importer, reviewer, and administrator
  shared a single tenant, so all importer data was mutually visible.
- **Removed** the name-matching branch in `ensure_supplier_record_for_profile` (was `026`).
  It matched new signups to existing supplier rows on company name alone, with no country or
  email check — a duplicate source and an account-hijack vector. Claiming an existing record
  now requires an invite token.
- **Added** `suppliers.record_mode` / `managed_by_importer_id` / claim columns, so importers
  can create and maintain exporter records for exporters who will not self-register.
- **Added** `documents.evidence_source` / `attested_by_name` / `attested_at`, so evidence the
  importer uploaded on a supplier's behalf stays distinguishable from supplier-attested
  evidence.
- **Dropped** the 49 unused legacy tables listed in `044_drop_unused_legacy_tables.sql`.
- **Kept** `importer_entry_identities` and `import_entries` despite being unused — they are
  the 21 CFR 1.509 backbone for FSVP identity at CBP entry. See
  `docs/importer-workflow-analysis.md` §2.
- **Repointed** `corrective_actions.supplier_id`, `readiness_assessments.supplier_id`, and
  `generated_reports.supplier_id` from the dropped `foreign_suppliers` to `suppliers`.
- **Dropped** dead columns that pointed at removed tables: `suppliers.organization_id`,
  `suppliers.foreign_supplier_id`, `products_verify.commodity_id`,
  `corrective_actions.food_id`, `documents.translated_by_qi_id`, and similar.
