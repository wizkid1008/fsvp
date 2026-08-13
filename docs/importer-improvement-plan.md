# Importer Section — Improvement Plan

Companion to [`importer-workflow-analysis.md`](./importer-workflow-analysis.md), which diagnoses
the current state. This document is the **process and edit plan**. Nothing here has been applied.

Date: 2026-07-30. Baseline: `main` @ `73690a8`.

> **Historical — parts of this have since shipped.**
>
> Kept unedited as a record of the plan as written. Read `/suppliers` below as
> **`/exporters`**, and `app/suppliers/page.tsx` as `app/exporters/page.tsx`.
>
> Landed since:
>
> - The "Suppliers" vs "My Exporters" naming mismatch (§ at the end of this
>   document) — done. The foreign company is an Exporter everywhere now,
>   including the signup account type and the route itself.
> - `components/suppliers/CreateExporterForm.tsx` — exists.
> - The importer nav order this document argued for — done, and the reasoning is
>   recorded in `data/nav-items.ts`.
>
> Superseded: the eleven-step journey in `lib/setup/fsvp-steps.ts` is now the
> canonical description of the importer workflow. Where this document and that
> array disagree, the array is what the app enforces.

---

## 0. What is being asked

Two things, and they are coupled:

1. **Improve the importer section** — close the three broken paths and make the surface coherent.
2. **Let importers create exporters themselves**, because real exporters often won't self-register.

(2) is not a small form change. It changes a load-bearing assumption: today the platform assumes
every `suppliers` row eventually has a human behind it who logs in and uploads their own evidence.
Once importers can create exporter records, some records will *never* have a human behind them —
and the importer will have to do that work on their behalf. That has consequences for evidence
provenance, scoring, and what the FSVP record can honestly claim. Section 2 deals with this in
full; it is the most substantive design work in this plan.

---

## 1. Target importer workflow

The end state, as a stage model. Each stage has an entry condition and a visible state, so the
dashboard can always answer "what do I do next?"

| # | Stage | Entry condition | Artifacts | Blocking exit condition |
|---|---|---|---|---|
| 0 | **Organization setup** | Account approved by admin | `importers` row: legal name, EIN, address, food scope, DUNS | Org record complete |
| 1 | **Exporter onboarding** | Org exists | `suppliers` row + `supplier_relationships` (`importer_supplier`) | ≥1 exporter with `active` or `managed` status |
| 2 | **Scope definition** | Exporter linked | `facilities_verify`, `products_verify` | ≥1 product with a facility |
| 3 | **Evidence collection** | Scope defined | `documents` with `evidence_status` | All critical requirement items have a document |
| 4 | **Evidence review** | Documents submitted | `documents.evidence_status = accepted/needs_revision/rejected` | No critical item left unreviewed |
| 5 | **FSVP record** | Supplier + facility + product exist | `fsvp_records` + narratives + hazard analysis + verification activities | All four narratives non-empty, hazard analysis `complete` |
| 6 | **Scoring** | Record populated | `scoring_results` fresh | `critical_blockers_present = false` |
| 7 | **Approval** | Scoring clean | `approval_decisions`, `reassessment_schedules` | Decision recorded |
| 8 | **Maintenance** | Approved | Reassessment schedule, expiry monitoring, corrective actions | Ongoing |
| 9 | **Production** | Approved record exists | Inspection-ready export package | On demand |

Today stages 1, 3→4, and 9 are broken, and 6 is skippable. The workstreams in §3 map onto these.

---

## 2. New capability — importer-created exporters

### 2.1 The problem in concrete terms

An importer wants to onboard "Andes Ingredients S.A." Andes has 11 employees, no interest in a
portal, and communicates by email and WhatsApp. The importer still carries the full FSVP
obligation under 21 CFR 1.502. They need the record to exist in ThrushCross regardless.

### 2.2 Why the existing "Add Supplier" button won't work as-is

`components/suppliers/SupplierTable.tsx:82,108` deliberately renders `AddSupplierForm` only when
`!isImporter`. If you simply flip that flag, three things break immediately:

1. **`supplier_type` defaults to `manufacturer`.** `AddSupplierForm.tsx:85-90` inserts without
   `supplier_type`, and `030_export_eligibility.sql:64` set the column default to `manufacturer`.
2. **The link would then be rejected.** `validate_exporter_link()`
   (`033_supplier_relationships.sql:291-307`) raises an exception when an `importer_supplier` row
   targets a non-export-eligible supplier type.
3. **The record would be invisible anyway.** `app/suppliers/page.tsx:42` filters
   `.in("supplier_type", ["exporter","exporter_manufacturer","trader"])`.

Also worth noting: the Edit (pencil) button at `SupplierTable.tsx:196-205` *is* rendered for
importers today, but `showForm && !isImporter` means clicking it does nothing. That is a live dead
control and gets fixed as part of this work.

### 2.3 Design: managed vs. claimed records

Introduce an explicit ownership concept on `suppliers`:

| `record_mode` | Meaning | Who edits the profile | Who uploads evidence |
|---|---|---|---|
| `self_managed` | Exporter registered themselves, owns their record | Exporter | Exporter |
| `importer_managed` | Importer created it; no exporter account exists | Importer who created it | Importer, on behalf of |
| `claim_pending` | Importer created it, invite sent, not yet accepted | Importer | Importer |

`importer_managed` → `claim_pending` → `self_managed` is a one-way ratchet. Once an exporter
claims the record, the importer loses profile-edit rights but keeps the relationship and all
previously uploaded evidence.

This mirrors the pattern that already works for exporters creating upstream suppliers
(`/api/supplier-links/invite`), so it is a generalization of proven code rather than a new idea.

### 2.4 Evidence provenance — the part that actually matters

If the exporter never joins, the importer uploads the exporter's documents. An FSVP record built
entirely on importer-keyed uploads is **not** the same evidentiary artifact as one where the
supplier attested to their own documents, and an FDA investigator will read it differently.

So `documents` needs a provenance field:

| `evidence_source` | Meaning |
|---|---|
| `supplier_attested` | Uploaded by a user whose profile belongs to the supplier |
| `importer_uploaded` | Uploaded by the importer on the supplier's behalf |
| `third_party` | Certification body, lab, or auditor report supplied directly |

Three consequences, all deliberate:

- The **review queue** must not ask an importer to "review" their own upload as though a supplier
  submitted it. Importer-uploaded documents should enter at `evidence_status = accepted` with the
  reviewing user recorded, or go to a reviewer if one is assigned — not sit in a fake pending
  state.
- **Scoring** should be able to weight `supplier_attested` above `importer_uploaded`. This is a
  policy decision for the rules engine, not a hardcode — expose it as a rule-version setting so
  it's versioned and auditable like everything else in `lib/scoring/engine.ts`.
- The **export package** (§3, WS-5) must print the provenance column. This is the honest thing to
  do and it protects the importer.

This is the single most important design decision in this plan. It is what keeps "importers can
create exporters" from quietly degrading the integrity of every FSVP record built that way.

### 2.5 Record lifecycle

```
                  importer clicks "Add exporter"
                             │
                             ▼
                    suppliers row created
              record_mode = importer_managed
              supplier_type = exporter (forced)
              managed_by_importer_id = <importer>
                             │
              ┌──────────────┴──────────────┐
     no email provided              email provided
              │                              │
              ▼                              ▼
      stays importer_managed        record_mode = claim_pending
      relationship = active         relationship = active  ← note: active, not pending
      (importer works alone)        invite_token issued, email sent
                                                │
                            ┌───────────────────┼───────────────────┐
                       accepted                declined         never answered
                            │                     │                  │
                            ▼                     ▼                  ▼
                   record_mode =          record_mode =      stays claim_pending
                    self_managed         importer_managed     (reminder at 14/30d)
                 profile.supplier_id      claim_declined_at
                    = suppliers.id             stamped
                 importer keeps link
                 + all prior evidence
```

**Key decision:** unlike the exporter→supplier invite, the *relationship* goes `active`
immediately even when an invite is outstanding. The importer must be able to work on the FSVP
record right away; whether the exporter ever logs in is irrelevant to the importer's obligation.
Only the *record ownership* is pending.

### 2.6 Claim collision — the trap

`ensure_supplier_record_for_profile()` (`026_auto_link_supplier_profiles.sql:68+`) currently
matches a new supplier-role signup to an existing `suppliers` row by
`lower(company_name) = lower(organization_name)`, with no country check and no email check.

Two problems, both of which get worse once importers can create records freely:

- **Duplicates.** Slightly different spelling ("Andes Ingredients" vs "Andes Ingredients S.A.")
  produces a second row and orphans the importer's managed record.
- **Hijacking.** Anyone who signs up with `organization_name` matching an existing row inherits
  that supplier record, including its evidence.

Fix as part of this work: name-matching must require an explicit invite token, or at minimum
`(name, country)` **plus** an email domain match against `contact_json.email`. Token is the right
answer; the name heuristic should be removed, not tightened.

### 2.7 Schema changes (migration `045_importer_managed_exporters.sql`)

```
suppliers
  + record_mode text not null default 'self_managed'
      check (record_mode in ('self_managed','importer_managed','claim_pending'))
  + managed_by_importer_id uuid references importers(id) on delete set null
  + claim_invite_token text unique
  + claim_invite_sent_at timestamptz
  + claimed_at timestamptz
  + claim_declined_at timestamptz
  + created_by_profile_id uuid references profiles(id) on delete set null

documents
  + evidence_source text not null default 'supplier_attested'
      check (evidence_source in ('supplier_attested','importer_uploaded','third_party'))
  + attested_by_name text          -- who at the supplier provided it, when off-platform
  + attested_at timestamptz
```

RLS additions:

- `suppliers_write`: add `managed_by_importer_id in (select public.current_importer_ids())
  and record_mode <> 'self_managed'` so the managing importer can edit, and loses that right the
  moment the record is claimed.
- `suppliers_read`: already covers importer-linked suppliers via `supplier_relationships`
  (`033_supplier_relationships.sql:252-260`) — no change needed.

Backfill: every existing `suppliers` row gets `record_mode = 'self_managed'`, every existing
`documents` row gets `evidence_source = 'supplier_attested'`. Both are the safe reading of
historical data.

### 2.8 API changes

**New — `POST /api/exporters/create`**

Modeled directly on `/api/supplier-links/invite`, which already does find-or-create + link +
invite correctly.

- Auth: `us_importer` or `administrator`, must have `importer_id`.
- Body: `company_name`, `country` (both required), `legal_entity_name`, `supplier_type`
  (constrained to `exporter` | `exporter_manufacturer` | `trader`, default `exporter`),
  `fda_registration_number`, `website`, `contact_name`, `contact_email`, `notes`.
- Duplicate check on `(lower(company_name), country)` before insert. If a row exists:
  - `self_managed` → do not create; return it and offer to link instead (this is the existing
    `/api/importer-links/add` path).
  - `importer_managed` by someone else → create a *separate* row for this importer. Two importers
    managing their own private record of the same company is correct and expected; merging them
    would leak data across tenants.
- Creates the `suppliers` row with `record_mode`, `managed_by_importer_id`, forced export-eligible
  `supplier_type`.
- Creates `supplier_relationships` (`importer_supplier`, `status: 'active'`).
- If `contact_email` present: issue `claim_invite_token`, set `record_mode = 'claim_pending'`,
  send via `auth.admin.inviteUserByEmail` with `redirectTo: /claim-exporter?token=…`.
- Writes `audit_logs` with `action: 'exporter_record_created'`.

**New — `POST /api/exporters/[id]/resend-invite`** and **`POST /api/exporters/[id]/claim`**
(accept/decline, mirroring `/api/supplier-links/accept`).

**Modified — `PATCH /api/exporters/[id]`**: profile edits, permitted only while
`record_mode <> 'self_managed'` and the caller is the managing importer.

**Modified — `/api/documents/upload`**: set `evidence_source` from the uploader's role rather than
defaulting; accept `attested_by_name` / `attested_at` for importer-uploaded documents. (This route
also carries the `importer_id` fix from WS-2.)

**Modified — `/api/importer-links/add`**: add the consent handshake noted in the analysis (T2-3),
so linking a *self-managed* exporter notifies them rather than silently attaching.

### 2.9 UI changes

- **`/suppliers`** — split the primary action into two: **"Link an exporter"** (existing, for
  registered exporters) and **"Add an exporter"** (new, creates a managed record). The empty state
  should present both, because a first-time importer has no idea which applies to them.
- **New `components/suppliers/CreateExporterForm.tsx`** — reuse `AddSupplierForm`'s field layout,
  add the supplier-type selector constrained to export-eligible values, and add an "Invite them to
  claim this record" section with the contact email. Copy must explain the consequence plainly:
  *"If you don't invite them, you'll be responsible for uploading and attesting to their evidence
  yourself."*
- **`SupplierTable`** — add a **Record** column showing Self-managed / Managed by you / Invite
  pending, and fix the dead Edit button (open `CreateExporterForm` in edit mode when the importer
  manages the record; hide it when the exporter owns it).
- **New `/claim-exporter` page** — mirrors `app/accept-invite/`.
- **Evidence upload** — when an importer uploads against an `importer_managed` exporter, show an
  attestation block: who at the supplier provided this document, and when. Writes
  `attested_by_name` / `attested_at`.
- **FSVP record detail** — a banner on records whose evidence is predominantly
  `importer_uploaded`, stating the reliance basis plainly.

### 2.10 Edge cases to handle explicitly

| Case | Behavior |
|---|---|
| Exporter claims a record with 40 importer-uploaded documents | Documents stay, `evidence_source` unchanged. History is not rewritten. |
| Two importers create records for the same company | Two rows, each privately managed. No merge. |
| Exporter self-registers *while* an invite is outstanding | Token still valid; on claim, link the new profile to the existing managed row rather than the trigger-created one. Requires the §2.6 fix. |
| Importer deletes a managed exporter with an approved FSVP record | Block. Offer `status: 'terminated'` on the relationship instead. |
| Exporter declines the claim | Reverts to `importer_managed`; importer keeps working. Surface the decline in notifications. |
| Managed exporter later needs upstream suppliers | Out of scope for v1 — that's the exporter's own module. Flag if it comes up. |

---

## 3. Workstreams

Sequenced by dependency, not by value. WS-0 gates almost everything.

### WS-0 — Importer identity and tenancy *(prerequisite)*

**Goal:** every importer organization is a real, separate tenant.

- Migration `046`: retire the first-row auto-link in `017_auto_link_importer.sql`; add
  `importers.duns_number`, `importers.company_name` (or fix `lib/evidence/review-queue.ts:94` to
  select `display_name` — pick one and be consistent).
- Signup: collect organization legal name, address, EIN, food scope for `us_importer` accounts.
  Create the `importers` row at admin approval, not at signup, so an unapproved account can't
  squat a tenant.
- Admin approval screen (`components/admin/UserManagement.tsx`): create-or-attach the importer org
  as part of approving the account.
- Backfill: existing importer profiles sharing the seed tenant need to be split by hand. **This
  needs a data audit before the migration is written** — how many real importer accounts exist,
  and whose data is whose.
- Re-verify every `importer_id` filter afterward.

**Acceptance:** two importer accounts created independently see disjoint FSVP records, documents,
corrective actions, reports, and audit log entries.

### WS-1 — Importer-created exporters

All of §2. Depends on WS-0 for `managed_by_importer_id` to mean anything.

**Acceptance:** an importer creates an exporter with no email, reaches an approved FSVP record
without any second party logging in, and every document in the export package is labelled
`importer_uploaded` with an attestation name and date.

### WS-2 — Evidence handoff repair

**Goal:** supplier-uploaded evidence reaches the right importer's queue.

- `/api/documents/upload`: when the uploader is a supplier/exporter, derive `importer_id` from
  their active `importer_supplier` relationships. If exactly one → set it. If several → set null
  and let the queue resolve by relationship.
- `lib/evidence/review-queue.ts`: scope by relationship, not by the stamped `importer_id`. This is
  the more correct model and survives an exporter serving multiple importers.
- Fix `importers.company_name` at line 94.
- Backfill migration for existing `importer_id IS NULL` documents.

**Acceptance:** exporter uploads a document; it appears in the linked importer's Review Queue
within one page load, and in no other importer's queue.

### WS-3 — FSVP record integrity

- Call `scoreFsvpRecord` **synchronously** inside `/api/fsvp-records/[id]/approve` before the
  blocker check. Fail closed if scoring errors — never approve on a null result.
- Validate the supplier/facility/product graph in `POST /api/fsvp-records`: supplier must be
  linked to the caller's importer; facility and product must belong to that supplier.
- Server-side filter the `/new` form's dropdowns instead of loading everything and filtering in
  the browser.
- Require the four narratives and a `complete` hazard analysis before approval is offered.

**Acceptance:** an FSVP record with no evidence cannot reach `importer_approved`.

### WS-4 — Reports and the inspection package

- Repoint `/api/reports/generate` from `foreign_suppliers`/`foods` to `suppliers`/`products_verify`.
- Check query errors; do not write a `generated_reports` row on failure.
- Add the **FSVP Record Package** export: one PDF/ZIP per FSVP record containing hazard analysis,
  supplier and facility evaluation, verification activities and results, corrective actions, the
  signed approval decision with rule-version provenance, the document index **with the provenance
  column from §2.4**, and a cover sheet with the importer's DUNS.

**Acceptance:** all three existing reports return populated files; the package export opens as a
single coherent document an investigator could read start to finish.

### WS-5 — Notifications

`app_notifications` currently has zero writers. Add inserts on: evidence accepted / revision
requested / rejected, FSVP approval decision, reassessment due (30/7/0 days), document expiring
(60/30/7 days), exporter claim accepted or declined, corrective action opened or overdue.

Cloudflare Pages has no cron; the date-driven ones need either a scheduled Worker or a
compute-on-read approach. **Decision needed** — see §5.

**Acceptance:** the Notifications page is non-empty in normal operation and each entry deep-links
to the record that generated it.

### WS-6 — Readiness and dashboard

- Readiness becomes per-supplier: supplier selector, supplier names resolved, section breakdown
  rendered from `readiness_scores` (wire up the orphaned
  `components/readiness/SectionReadinessList.tsx`).
- Importer dashboard gains a process-flow view and a real task list, matching what
  `ExporterDashboard` already has via `FsvpProcessFlow` and `ActionItemsSection`. Add expiring-
  certification warnings from `documents.expiration_date`.

### WS-7 — Navigation and onboarding coherence

- Decide whether importers own `/products`, `/facilities`, `/evidence`. Given WS-1, the answer is
  **yes** — a managed exporter's products and facilities have to be created by someone, and that
  someone is the importer. So: add them to importer nav and scope their queries by the importer's
  linked suppliers (they are currently unscoped for importers — `app/products/page.tsx:89-93`).
- Rewrite `IMPORTER_STEPS` to match the §1 stage model: org setup → add or link an exporter → add
  facility & product → collect evidence → review → create FSVP record → approve → export package.
- Fix the `/suppliers` "Suppliers" vs "My Exporters" naming mismatch.
- Drop the dead `food_id` select in `app/gaps-actions/page.tsx:14`.

---

## 4. Revised for a dummy-data environment

**Confirmed 2026-07-30: there is no production data. Everything is dummy.** This changes the plan
more than it might appear.

### 4.1 What it removes

- **No tenancy data audit.** WS-0 stops being a delicate per-tenant data separation and becomes a
  clean rewrite: drop the auto-link trigger, add organization capture at admin approval, reseed.
- **No backfills.** The `record_mode`, `evidence_source`, and `documents.importer_id` backfills in
  §2.7 and WS-2 exist only to reinterpret historical rows. With no history, they collapse into
  column defaults.
- **Migration 047 disappears entirely** — it was purely a `documents.importer_id` backfill.
- **WS-0 stops gating WS-1.** They can now proceed in parallel, or in either order.

So the sequencing constraint I flagged last — don't ship managed exporters before the tenancy
split — is no longer a scheduling problem. It's just two migrations that both need to land before
either feature is exercised.

### 4.2 What it exposes

Three things that were survivable with live data and are now simply worth fixing:

1. **`supabase/seed/sample_data.sql` is dead.** Line 10 inserts into `foreign_suppliers`, dropped
   by `034_retire_foreign_suppliers.sql:52`; line 34 inserts into `supplier_products`, which is in
   the `044` drop list. The file fails on execution. `README.md` step 3 still instructs you to run
   it.
2. **`supabase/fsvp_full_setup.sql` is ~30 migrations stale.** Generated 2026-06-05, before
   migrations 015–044. It still contains `foreign_suppliers`, `subscription_entitlements`, and the
   pre-redesign schema. Anyone bootstrapping from it gets a database the app cannot run against.
3. **The seed creates two importers in a single statement**
   (`024_seed_test_data.sql:54-60`), so both rows share a `created_at`. The auto-link trigger's
   `order by created_at limit 1` therefore picks between them **non-deterministically**. Which
   tenant a new importer account lands in is currently down to physical row order.

### 4.3 The baseline decision

With 44 migrations and no data to protect, there is a real fork:

**Option A — keep linear history, add 045/046/048.** Lowest effort. Preserves the reasoning trail.
But roughly fifteen of the existing migrations exist only to patch earlier ones (026→031,
019→020→039, 027→030→033→042, 035/028/029 on RLS), so every future RLS question stays a forensic
exercise across five files.

**Option B — collapse to a single `000_baseline.sql` reflecting the intended end state**, move the
existing migrations to `supabase/migrations/archive/`, and rewrite the seed. Zero risk with no
live data. It also resolves migration `044` by construction — the legacy 001–013 layer simply
isn't in the baseline — and that legacy layer is, per the analysis, the root cause of the importer
problems.

**Recommendation: Option B.** The importer section is weak precisely because two schema
generations are stacked; carrying the stack forward while fixing its symptoms is the more
expensive path. Git history preserves the "why"; the archive folder preserves the text.

Two carve-outs if we take Option B:
- Keep `importer_entry_identities` and `import_entries` in the baseline (per the integration
  analysis — they are the §1.509 backbone), even though nothing uses them yet.
- Do **not** carry forward `foreign_suppliers`, `foods`, `subscription_entitlements`, or the other
  49 tables in the `044` list.

### 4.4 Resulting migration set

Under Option A:

| # | File | Contents |
|---|---|---|
| 045 | `importer_managed_exporters.sql` | `suppliers.record_mode` + claim columns; `documents.evidence_source` + attestation; RLS |
| 046 | `importer_tenancy.sql` | Retire the auto-link trigger; importer org fields; DUNS; resolve the `company_name` / `display_name` mismatch |
| 047 | `apply_044_legacy_drop.sql` | Apply the held legacy drop, minus `importer_entry_identities` and `import_entries` |
| 048 | `supplier_claim_hardening.sql` | Replace name-matching in `ensure_supplier_record_for_profile` with token-based claiming |

Under Option B: one `000_baseline.sql` containing all of the above as first-class schema, plus a
rewritten `supabase/seed/sample_data.sql` that seeds **two independent importer tenants** with
disjoint suppliers, documents, and FSVP records — which is exactly the fixture needed to prove the
tenancy split works.

---

## 5. Remaining decisions

Decision 1 (tenancy data audit) is **resolved — no live data.** Four remain:

1. **Baseline: Option A or B?** See §4.3. Recommend B.
2. **Scoring weight for `importer_uploaded` evidence.** Same as supplier-attested, or discounted?
   Recommend: rule-version setting, equal weight for v1, revisit with a compliance reviewer. Do
   not hardcode.
3. **Notification scheduling.** Cloudflare Pages has no cron. Recommend Supabase `pg_cron` — the
   date logic already lives in the database and it avoids a second deployment target.
4. **Should a self-managed exporter be able to refuse an importer link?** Currently unilateral
   (T2-3). Recommend yes, with the relationship active during the pending window so the importer
   is never blocked.

None of these block starting. 2 and 4 have safe defaults; 3 is only needed at WS-5.

---

## 6. Suggested execution order

```
Baseline decision (§4.3)
        │
        ▼
schema:  045 managed exporters + 046 tenancy  ──┐   (or 000_baseline)
        │                                        │
        ├──> WS-0 tenancy wiring ────────────────┤
        │      signup/approval org capture       │
        │                                        ▼
        ├──> WS-1 exporter creation ──────> WS-7 nav + onboarding
        │      /api/exporters/*                  ▲
        │      CreateExporterForm                │
        │      claim flow                        │
        │                                        │
        ├──> WS-2 evidence handoff ──> WS-3 integrity ──> WS-4 reports + package
        │                                        │
        ├──> WS-5 notifications ─────────────────┤
        └──> WS-6 readiness + dashboard ─────────┘
                                            reseed fixtures
```

Recommended first slice, and the one I'd start with: **the schema pair plus WS-0 wiring plus
WS-1**. That is the smallest change that makes "add an exporter" real and safe at the same time,
and it is independently demonstrable — create two importer accounts, have each add the same
exporter company, and confirm they get separate records and cannot see each other's.

WS-2 through WS-4 are the correctness repairs and are best done as one pass afterward, since they
share the evidence→scoring→report chain.
