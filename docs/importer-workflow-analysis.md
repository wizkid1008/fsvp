# Importer Workflow — Analysis and Integration Map

Status: analysis only. No code, schema, or config changes proposed here have been applied.
Date: 2026-07-30. Reviewed against `main` @ `73690a8`.

> **Historical — read as a record of 2026-07-30, not as current state.**
>
> Kept unedited because it documents what was true then; rewriting the route
> names would destroy that. Since this was written:
>
> - `/suppliers` was renamed to **`/exporters`** (a redirect keeps old links
>   working). Every reference to `/suppliers` and `app/suppliers/page.tsx` below
>   should be read as `/exporters` and `app/exporters/page.tsx`.
> - The naming mismatch noted in Part 1 — the page titled "My Exporters" reached
>   from a nav item labelled "Suppliers" — is fixed. The exporter's own upstream
>   list is now "Upstream Vendors", so one word no longer means two companies.
> - The dashboard tile that linked to `/suppliers` was replaced; the importer
>   dashboard now leads with what is blocking approval.
>
> For the journey the app actually enforces today, read
> `lib/setup/fsvp-steps.ts` — it is the single source the setup planner and the
> onboarding modal both render from.

---

## Part 1 — Importer section analysis

### 1.1 What "the importer section" currently is

Nav items gated to `us_importer` (`data/platform.ts:57-64`):

| Route | Page | Backing API |
|---|---|---|
| `/dashboard` | inline `ImporterDashboard` in `app/dashboard/page.tsx:19-113` | direct queries |
| `/suppliers` | `app/suppliers/page.tsx` | `/api/importer-links/{search,add}` |
| `/fsvp-records` | list + `[id]` detail + `/new` | `/api/fsvp-records`, `.../approve`, `.../evidence`, `.../reassess` |
| `/importer-review` | `app/importer-review/page.tsx` | `/api/evidence/review` |
| `/gaps-actions` | `app/gaps-actions/page.tsx` | `/api/corrective-actions` |
| `/readiness` | `app/readiness/page.tsx` | `/api/readiness/assess` |
| `/reports` | `app/reports/page.tsx` | `/api/reports/generate` |
| `/notifications` | `app/notifications/page.tsx` | `/api/notifications/mark-read` |

Reachable but **not** in importer nav, yet linked from the dashboard tiles and the onboarding
modal: `/evidence`, `/products`, `/facilities`.

The intended loop is: link an exporter → they upload evidence → importer reviews it → importer
opens an FSVP record per supplier/facility/product → attaches accepted evidence, writes the
four narratives, hazard analysis and verification activities → scores → approves → schedules
reassessment → exports a report.

**The loop does not close today.** Three separate breaks sit on the main path.

---

### 1.2 Tier 1 — the workflow does not close

#### T1-1. Every importer account is bound to the same tenant

`supabase/migrations/017_auto_link_importer.sql:26-33` assigns *the first `importers` row on the
platform, ordered by `created_at`* to every new `us_importer`, `reviewer`, and `administrator`
profile that has no `importer_id`.

Nothing ever creates a per-organization `importers` row. Signup collects only email, password,
and account type (`components/auth/AuthForm.tsx:59-79`) — no legal name, EIN, address, or food
scope, all of which `importers` requires or offers (`supabase/migrations/001_tenancy.sql:11-26`).
The only `insert into importers` statements in the repo are seed data
(`supabase/seed/sample_data.sql:1`, `supabase/migrations/024_seed_test_data.sql:54`).

Consequences, because nearly all RLS is `importer_id in (select public.current_importer_ids())`
(`supabase/migrations/013_app_auth_storage_readiness.sql:305-337`, and
`022_fsvp_records_scoring_approvals.sql:185-204`):

- Importer A sees Importer B's FSVP records, documents, corrective actions, readiness
  assessments, audit log, and generated reports.
- `/reports` aggregates across all importers and labels the output as one importer's.
- The tenancy model is architecturally present and functionally absent.

This is the single highest-severity item. It is a data-segregation defect in a compliance
product, and every scoping fix below is downstream of it.

#### T1-2. Supplier-uploaded evidence never reaches the importer's review queue

`app/api/documents/upload/route.ts:65` sets:

```
resolvedImporterId = importerId || uploaderProfile?.importer_id || null
```

For a `supplier` or `exporter` profile, `importer_id` is null — the auto-link trigger only fires
for `us_importer`/`reviewer`/`administrator` (`017_auto_link_importer.sql:16-18`). The client
uploaders only append `importer_id` when the profile has one
(`components/evidence/EvidenceUploadPanel.tsx:145`,
`components/evidence/DirectEntityUploadTile.tsx:80`,
`components/corporate/CorporateScopeUploadTile.tsx:134`).

So supplier-submitted documents land with `importer_id = null`.

`lib/evidence/review-queue.ts:45-47` scopes the importer's queue with
`.eq("importer_id", importerId)`, which excludes NULL. **An importer's Review Queue therefore
never shows evidence uploaded by their suppliers** — only evidence the importer uploaded
themselves. The reviewer/admin platform-wide queue (`importerId = null`, no filter) does show
them, which is why this has not been obvious.

Note the queue is keyed on `documents.importer_id` at all, not on the importer↔supplier
relationship. Even once the null is fixed, the correct scope is "documents from suppliers linked
to me", not "documents stamped with my id at upload time".

#### T1-3. The reports engine queries tables that were dropped

`app/api/reports/generate/route.ts` joins `foreign_suppliers(supplier_name)` at lines 72, 89, and
108, and `foods(food_name)` at line 89. `foreign_suppliers` was dropped in
`supabase/migrations/034_retire_foreign_suppliers.sql:52`; `foods` is in the drop list of
`044_drop_unused_legacy_tables.sql:89`.

All three report types — Supplier Readiness, Compliance Gap Register, Document Status Index —
will fail at the PostgREST level. The route does not check the query error, so it will still
insert a row into `generated_reports` and return an empty CSV/HTML. `/reports` will list reports
that contain nothing. This is the terminal step of the importer workflow and the deliverable an
auditor would ask for.

---

### 1.3 Tier 2 — controls that do not hold

#### T2-1. The approval gate can be bypassed by never scoring

`app/api/fsvp-records/[id]/approve/route.ts` blocks approval when the latest `scoring_results`
row has `critical_blockers_present`. If **no** scoring row exists, `scoringResult` is null and
approval proceeds.

Nothing runs scoring for an `fsvp_record` automatically:

- `/api/scoring/recalculate` is called only from `app/api/evidence/review/route.ts:142,149`, and
  only for `entity_type: "facility"` and `"product"` — never `"fsvp_record"`.
- That call is additionally gated on `doc.rule_version_id` being non-null (line 138), which
  documents generally do not carry.
- `scoreFsvpRecord` otherwise runs only inside `/api/readiness/assess`.

Net: an importer can create an FSVP record with zero evidence, zero narratives, no hazard
analysis, and approve it. The approve route will happily write `importer_approved`, stamp
`approved_at`, and schedule a reassessment. The record is then locked
(`app/fsvp-records/[id]/page.tsx:80`) and looks authoritative in exports.

#### T2-2. FSVP record creation is not constrained to the importer's own graph

`app/api/fsvp-records/route.ts` validates only that the rule version is published. It does not
check that `supplier_id` is linked to the importer, or that `facility_id` and `product_id` belong
to that supplier. The `/new` form loads suppliers, facilities, and products through the browser
client with no filter (`app/fsvp-records/new/page.tsx:29-32`) and filters by supplier only in
client-side memory (lines 44-52).

#### T2-3. Importer→exporter linking is unilateral and immediate

`app/api/importer-links/add/route.ts:48-51` inserts `supplier_relationships` with
`status: "active"` directly. There is no invite/accept handshake, in contrast to the
exporter→supplier path, which has `/api/supplier-links/invite` and `/api/supplier-links/accept`.
Any importer can attach any exporter in the platform without their knowledge and immediately gain
standing in that relationship.

#### T2-4. `importers.company_name` does not exist

`lib/evidence/review-queue.ts:94` selects `id, company_name` from `importers`. The table has
`legal_name` and `display_name` (`001_tenancy.sql:11-26`) and was never altered. This path only
runs for the reviewer/admin platform-wide queue, where it silently yields `importer_name: null`
for every row.

---

### 1.4 Tier 3 — product coherence

#### T3-1. Readiness conflates per-supplier assessments into one global number

`readiness_assessments` rows are per `(importer_id, supplier_id)` — `/api/readiness/assess`
requires a `supplier_id`. But `components/readiness/ReadinessPageClient.tsx:60-62` takes
`assessments[0]` — simply the most recent row — and renders it as "Overall Readiness" for the
whole importer. The supplier name is never resolved; `supplier_id` is selected
(`app/readiness/page.tsx:14`) and never displayed. "Assessment History" is a mixed list of
different suppliers with no supplier column.

`components/readiness/SectionReadinessList.tsx` exists and is imported by nothing. The
per-section scores that `/api/readiness/assess` writes into `readiness_scores` (lines 90-103)
are never rendered anywhere.

#### T3-2. The importer dashboard is materially thinner than the supplier dashboards

`ExporterDashboard` and `ManufacturerDashboard` both render `FsvpProcessFlow`,
`ActionItemsSection`, and (for manufacturers) `OpenTasksSection`. The importer dashboard
(`app/dashboard/page.tsx:19-113`) is five count tiles and four FSVP status counts. The importer —
the party who actually owns the FSVP obligation — gets no task list, no "what's blocking me", no
process view, and no expiring-certification warnings, despite `documents.expiration_date` being
populated and surfaced elsewhere.

#### T3-3. Navigation dead-ends

- `/evidence` is linked from the dashboard tile (`app/dashboard/page.tsx:58`) and onboarding step
  4, but has no nav entry for any role.
- `/products` and `/facilities` are linked from dashboard tiles and onboarding step 3, but are
  gated to `exporter`/`supplier`/`administrator` in nav. They do load for importers
  (`requireProfileRole` is called with no role list), and because `isSupplier` is false the
  supplier scoping at `app/products/page.tsx:89-93` is skipped entirely — the importer sees
  whatever RLS returns, which given T1-1 is everything.
- The dashboard's "Suppliers" tile links to `/suppliers`, which is titled "My Exporters".

#### T3-4. Notifications are read-only in practice

`app_notifications` is read by `app/notifications/page.tsx:13` and `app/admin/page.tsx:71`, and
updated by `/api/notifications/mark-read`. **No code path ever inserts a row.** The Notifications
nav item is permanently an empty page. Evidence rejection, approval decisions, reassessment due
dates, and certificate expiry — all the events that should drive an importer — notify nobody.

#### T3-5. Onboarding contradicts the data model

`IMPORTER_STEPS` (`components/onboarding/OnboardingModal.tsx:14-20`) is: profile → add supplier →
add products & facilities → upload evidence → run readiness assessment. It never mentions FSVP
records or the review queue, which are the two things that distinguish this product. Steps 3 and
4 point importers at pages the nav says are not theirs. Step 5's readiness assessment scores FSVP
records that step 4 never told them to create — so a new importer's first assessment necessarily
returns "No FSVP records found for this supplier."

#### T3-6. Dead column carried through the UI

`app/gaps-actions/page.tsx:14` selects `food_id`, a column whose FK target (`foods`) is in the
044 drop list and which no writer populates.

---

### 1.5 Root cause

Two schema generations are layered on top of each other. Migrations 001-013 modeled a full
FSVP/ITDS domain — `importers` as real tenants, `importer_entry_identities` (§ 1.509 DUNS),
`import_entries`, `qualified_individuals`, `subscription_entitlements`. Migration 014 replaced the
supplier-facing half with a simpler model and the app was built on that, but the **importer**
half was never rebuilt to match — it was stubbed with the auto-link trigger and left there.

The supplier and exporter surfaces got the second-generation treatment (context switching,
relationship tables, per-section requirements, process flow). The importer surface is still
running on first-generation assumptions with second-generation queries pointed at it. That is why
this section feels weakest: it is the only role whose organizational identity was never
implemented.

### 1.6 Suggested remediation order

1. **Importer identity and tenancy.** Create a real `importers` row at signup/approval, collect
   legal name + EIN + address + food scope, retire the first-row auto-link trigger, backfill
   existing profiles, then re-verify every `importer_id`-scoped query. Everything else is
   unreliable until this lands.
2. **Evidence handoff.** Derive `documents.importer_id` from the supplier's active
   `supplier_relationships` at upload, or re-scope the review queue to the relationship instead
   of the stamped id. Add a backfill for existing null rows.
3. **Reports.** Repoint to `suppliers` / `products_verify`, check query errors, and stop writing
   a `generated_reports` row when the query failed.
4. **Approval integrity.** Force a fresh `scoreFsvpRecord` synchronously inside the approve
   route and fail closed when scoring is unavailable. Validate the supplier/facility/product
   graph at record creation.
5. **Notifications.** Write rows on evidence decisions, approvals, reassessment due, and
   expiring documents. This is what makes the importer surface feel alive.
6. **Readiness and dashboard.** Per-supplier readiness with names and section breakdown; give
   the importer dashboard the same process-flow and task treatment the exporter has.
7. **Nav and onboarding coherence.** Decide whether importers own products/facilities/evidence
   pages; align nav, dashboard tiles, and onboarding to that decision.

---

## Part 2 — Integration map: payments and government submission

### 2.1 Reality check on "submit to CBP"

There is no single API that accepts FSVP documentation. What people mean by "submit to CBP"
decomposes into four distinct channels with different owners, protocols, and legal gates:

| # | Channel | What actually moves | Protocol | Can ThrushCross do it directly? |
|---|---|---|---|---|
| A | FSVP importer identity at entry | Entity role code `FSV` + name + email + DUNS on the entry line | ABI/ACE (CATAIR), EDI-style | **No** — requires a licensed broker or ABI self-filer |
| B | FDA Prior Notice | Shipment/food/manufacturer detail before arrival | ABI/ACE, or PNSI web UI at access.fda.gov | **No API** — broker via ABI, or manual PNSI |
| C | FSVP records production to FDA | The FSVP record package itself | FSVP Importer Portal on FURLS (access.fda.gov) | **No API**, and inspection-gated |
| D | Entry document submission / holds | COAs, labels, affidavits for a held entry | ITACS web UI | **No public API** |

The honest framing: **ThrushCross is the system of record that makes A–D fast and correct. It is
not, and realistically will not be, the transmitter.**

#### Channel A — FSVP identity at entry (§ 1.509)

Entry lines subject to FSVP carry entity role code `FSV` with the FSVP importer's name, email,
and an acceptable Unique Facility Identifier — in practice a 9-digit DUNS number. `FSX` marks
exempt lines, `RNE` research/evaluation. The `UNK` placeholder has been phased out.

This is transmitted in the entry by the filer. ABI is the only approved method for filing entry
and entry summary in ACE; you must be a CBP-certified ABI software vendor, a self-developer, or
go through a service center, and you must pass testing in CBP's CERT environment first.

Note the schema already anticipated this: `importer_entry_identities`
(`supabase/migrations/001_tenancy.sql:29-42`) holds effective-dated `duns_number` + contact,
with a partial unique index on the current identity, and `import_entries`
(`008_entries_documents.sql:5-21`) holds entry number, port, `pre_entry_check_passed`, and
`pre_entry_check_blockers`, with `created_via in ('manual','broker_import','ace_integration')`.
Both are currently in the 044 drop list. **Do not drop them** — they are the correct backbone for
this feature and are worth keeping even if it takes 18 months to use them.

#### Channel B — Prior Notice

Submitted either through ABI/ACE (up to 30 days before arrival) or FDA's PNSI web interface at
access.fda.gov (up to 15 days). PNSI is a human web application; there is no documented public
API. Same conclusion as A: the broker's ABI stack does this.

#### Channel C — FSVP records to FDA

FDA operates an **FSVP Importer Portal for FSVP Records Submission** inside FDA Industry Systems
(FURLS, access.fda.gov). Two properties matter for design:

1. **It is inspection-gated.** An FSVP inspection must be initiated by FDA before the portal is
   accessible to that importer. You cannot pre-file.
2. **It is a manual upload UI with an FDA Account ID login.** No API, no machine-to-machine
   submission.

So the deliverable ThrushCross should build is not a submission integration — it is a
**one-click, inspection-ready export package**: a single PDF/ZIP per supplier-food combination
containing the hazard analysis, supplier evaluation, verification activities and results,
corrective actions, the signed approval decision with rule-version provenance, and a document
index. The importer then uploads that to the portal themselves within the FDA-stated window.

This is a better product than an integration would be: the binding constraint on importers during
an FSVP records request is *assembling* the package, not transmitting it. `/api/reports/generate`
and `app/fsvp-records/[id]/print/page.tsx` are the seeds of this.

#### Channel D — ITACS

For entries under FDA review, ITACS lets filers check entry status, submit documents
electronically, provide the examination location, and retrieve Notices of FDA Action. Web UI, no
public API. Relevant later, and only if you move into entry-line workflow.

#### Read-only government APIs that *are* available now

These are real, free, and immediately useful for enriching supplier risk scoring:

| Source | Endpoint | Use in ThrushCross |
|---|---|---|
| FDA Data Dashboard API | `datadashboard.fda.gov/oii/api/` | Import refusals, inspection classifications, compliance actions by firm/country. Feed into `lib/scoring/engine.ts` as a supplier risk signal. Refusals refresh weekly. |
| openFDA | `api.fda.gov/food/enforcement.json` | Recall/enforcement history for a supplier or commodity. Drives `corrective_actions` with `triggered_by: "recall"`. |
| D&B Direct+ | `directplus.documentation.dnb.com` | DUNS lookup and validation for the FSVP importer identity in Channel A, and for foreign supplier identity. Paid, contract-gated; the free web lookup tool is the manual fallback. |

Bringing refusal and recall history into supplier scoring is genuinely differentiating and has no
regulatory gatekeeper. I would put this ahead of any filing integration.

---

### 2.2 Payments

There is currently **zero** payment code in the repository. What exists is vestigial schema:
`importers.stripe_customer_id` (`001_tenancy.sql:20`) and `subscription_entitlements` with
`stripe_subscription_id` (`010_supplier_portal_api_ops.sql:62-78`) — the latter is in the 044
drop list. `role_permissions` seeds a `manage_billing` permission
(`012_triggers_rls_seed.sql:71`) that nothing reads.

Two payment rails, which must not be conflated:

#### Rail 1 — SaaS subscription (build this)

Stripe Billing. Current API version is `2026-06-24.dahlia`; monthly releases are
backward-compatible.

Shape:

- Subscription lives on the **importer organization**, not the user — which is another reason
  T1-1 must be fixed first. `importers.stripe_customer_id` is already the right column.
- Likely metering dimensions given the domain: number of linked exporters, number of active FSVP
  records, seats, report/export volume. Per-supplier is the most defensible unit — it maps to the
  customer's own risk exposure.
- Reinstate `subscription_entitlements` (do not drop it) as the entitlement cache; gate features
  off that table, never off a live Stripe call.
- Webhook endpoint (`/api/stripe/webhook`) with signature verification, handling
  `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`,
  `invoice.payment_failed`. Must be idempotent — store the event id.
- Cloudflare Pages/edge runtime caveat: use Stripe's fetch-based HTTP client, and verify webhook
  signatures with `constructEventAsync` (WebCrypto), not the sync Node variant.
- Suppliers and exporters stay free. They are the supply side of the network; charging them kills
  adoption and therefore kills the importer's data quality.

#### Rail 2 — Duties, taxes, and FDA fees (do not build this)

Customs duties are paid via ACH debit/credit or Periodic Monthly Statement against the **filer's**
ACE account, and FDA user fees go through pay.gov. Both require being the broker or IOR of record.
Touching this rail brings money-transmission and customs-bond exposure with no product upside.

If you eventually want to show duty amounts, get them from the broker partner's API as read-only
data, and never move the money.

---

### 2.3 Recommended sequencing

**Phase 0 — prerequisite.** Fix importer tenancy (T1-1). Payments and any government identity
work are both keyed to a real importer organization.

**Phase 1 — payments.** Stripe Billing on the importer org. Self-contained, no external
gatekeeper, and it is what turns this into a business.

**Phase 2 — the export package.** The inspection-ready FSVP record package (Channel C). Highest
customer value per unit of effort, zero regulatory dependency, and it fixes T1-3 along the way.

**Phase 3 — read-only government data.** FDA Data Dashboard + openFDA into supplier scoring.
Differentiating, free, no gatekeeper.

**Phase 4 — FSVP identity management.** Revive `importer_entry_identities`: capture and validate
the DUNS, manage effective-dated changes, and produce a per-shipment "FSV data block" (importer
name, email, DUNS, FSV/FSX/RNE determination) that the importer hands to their broker. Add
`pre_entry_check` against FSVP record status so the platform can say "this line is not covered by
an approved FSVP record" *before* the entry is filed. This is the highest-value thing you can do
without becoming a filer.

**Phase 5 — broker integration (partner, don't build).** Partner with an existing ABI filer or
platform (CargoWise, Descartes OneView, NetCHB are the three dominant ABI stacks) and exchange
the FSV data block over their API. Becoming a CBP-certified ABI self-developer — CATAIR
implementation plus CERT-environment testing plus ongoing message-set maintenance — is a
multi-quarter commitment that duplicates a commodity capability.

---

### 2.4 Open questions

1. Is ThrushCross intended to serve the FSVP importer themselves, or the customs broker acting
   for many importers? The tenancy model differs substantially (broker = parent org with many
   importer children), and it should be decided before Phase 0 rather than after.
2. Who is the paying customer — the U.S. importer, or the exporter who wants to be verifiable to
   many importers? Current architecture assumes the importer; the supplier-side surfaces are far
   more built out, which suggests otherwise.
3. Should suppliers/exporters ever be chargeable? Affects whether billing hangs off `importers`
   alone or off a shared `billing_accounts` table.
4. Is entry-line workflow (`import_entries`) in scope at all, or does ThrushCross stop at the
   FSVP record? This determines whether migration 044 should keep `import_entries` and
   `importer_entry_identities`.

---

## Sources

- [CBP — ACE Automated Broker Interface (ABI) CATAIR](https://www.cbp.gov/trade/automated/catair)
- [CBP — ABI Software Vendors and Service Providers](https://www.cbp.gov/reusable-block/ace-software-vendors-and-service-providers)
- [CBP — How to Use ACE](https://www.cbp.gov/trade/automated/how-to-use-ace)
- [FDA — FSMA Final Rule on Foreign Supplier Verification Programs](https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-foreign-supplier-verification-programs-fsvp-importers-food-humans-and-animals)
- [FDA — Guidance: Compliance with Providing an Acceptable Unique Facility Identifier for FSVP](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-industry-compliance-providing-acceptable-unique-facility-identifier-foreign-supplier)
- [FDA — Opens Industry Portal for FSVP Records Submission](https://www.fda.gov/food/cfsan-constituent-updates/fda-opens-industry-portal-fsvp-records-submission)
- [FDA — Prior Notice of Imported Foods](https://www.fda.gov/industry/fda-import-process/prior-notice-imported-foods)
- [eCFR — 21 CFR 1.280, How must you submit prior notice?](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1/subpart-I/subject-group-ECFR03e54b15325e2a9/section-1.280)
- [FDA Data Dashboard API documentation](https://datadashboard.fda.gov/oii/api/index.htm)
- [FDA Industry Systems (FURLS)](https://www.access.fda.gov/)
- [Stripe API versioning](https://docs.stripe.com/api/versioning)
- [Stripe — How subscriptions work](https://docs.stripe.com/billing/subscriptions/overview)
- [D&B Direct+ documentation](https://directplus.documentation.dnb.com/)
- [Descartes — ACE for U.S. Customs Brokers and Importer Self-Filers](https://www.descartes.com/resources/knowledge-center/ace-us-customs-brokers-and-importer-self-filers)
