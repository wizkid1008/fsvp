# FSVP Platform — Development Handoff

Current as of 2026-08-25, `main` @ `3fe0035`. The last two weeks went into the
importer's own path through the product — classification, FDA product codes,
procedures, product lifecycle — rather than into new compliance depth.

---

## 1. What this is

**ThrushCross Verify** — a compliance platform for US food importers subject to
the FDA Foreign Supplier Verification Program (21 CFR Part 1, Subpart L). It
holds supplier qualification records, evidence, FSVP determinations, commodity
admissibility, and the importer's own procedures.

Regulatory context drives most design decisions. When a choice is between
"convenient" and "defensible in an FDA inspection", pick defensible.

---

## 2. Environment — read this first

**There is no Node toolchain on the maintainer's machine.** No `node`, `npm`,
`npx`, or `gh`. You cannot run typecheck, tests, or builds locally. **CI is the
only feedback loop**, ~2–4 minutes per push. Batch related work onto one branch
rather than pushing per-fix.

- **Repo:** https://github.com/wizkid1008/fsvp
- **Deployed:** https://fsvp.pages.dev (Cloudflare Pages, auto-deploys `main`)
- **Stack:** Next.js 14 App Router, `runtime = "edge"` on nearly every
  page/route, Supabase (auth + Postgres + RLS), `@cloudflare/next-on-pages`
- **CI:** `.github/workflows/ci.yml` — typecheck, vitest, then `pages:build`
  (the *real* Cloudflare build, not `next build`)

### Cloudflare secrets: two scopes, and the wrong one fails silently

This cost an afternoon. See `docs/cloudflare-pages.md`.

- **Settings → Variables and secrets** = BUILD scope. Correct only for
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which Next
  inlines at compile time. (The `+ Add` button is at the panel's TOP RIGHT.)
- **Settings → Bindings** = RUNTIME scope. Anything read via `process.env` when
  a request arrives must live here: `SUPABASE_SERVICE_ROLE_KEY`,
  `FDA_DATADASHBOARD_USER`, `FDA_DATADASHBOARD_KEY`, `OPENFDA_API_KEY`,
  `FDA_PCB_USER`, `FDA_PCB_KEY`, `INGEST_TRIGGER_SECRET`.

A build-scope-only service-role key is `undefined` at request time, so
`createAdminSupabaseClient()` throws and **all 13 pages that call it break at
once**. Same symptom if the value merely contains `xxxxx` (treated as a
placeholder).

**Two things that look like evidence and are not:** `/dashboard` and `/account`
loading prove nothing — the first only builds the admin client when previewing a
supplier account, the second never uses it. And a stable Next error digest across
deploys means an unchanged *message*, not a stale build.

### Never commit a pnpm lockfile

Cloudflare Pages picks its package manager **from whichever lockfile is in the
repo**. Committing `pnpm-lock.yaml` flips the build from npm to pnpm, and
`next-on-pages` then cannot find the vercel binary — the build dies with no
obvious link to the file that caused it. Both `pnpm-lock.yaml` and
`pnpm-workspace.yaml` are in `.gitignore` with that reason written beside them.
`fc8ea8a` committed one; `979b96a` undid it the same morning.

---

## 3. Database

Migrations `000`–`025`. `000_baseline.sql` consolidates the original 44
(archived under `supabase/migrations/archive/`).

| Migration | Contents |
|---|---|
| 000–002 | Baseline schema, RLS, reference data |
| 003–008 | Alerts, reviewer tenancy, QI register, evidence forms, applicability |
| 009 | Regulatory intelligence — FDA events, per-tenant attribution, ingest runs |
| 010 | Supplier suspension, § 1.507 assurances, § 1.506(d) determinations, § 1.508(b) triggers |
| 011 | § 1.510 retention enforcement, signature ledger view |
| 012 | Commodity taxonomy, country-commodity rules |
| 013 | Admissibility determinations |
| 014 | Rule verification (draft → verified), change-detection hooks |
| 015 | Exporter claim function — claiming a record actually works |
| 016 | Alert delivery, exactly once |
| 017 | FDA facility registration renewal, 21 CFR 1.230 (roadmap Phase 2, item 11) |
| 018 | Starter commodity taxonomy seed |
| 019 | Rule review notifications — the review schedule reaches a person |
| 020 | The importer's own FSVP records |
| 021 | Importer procedures as editable, versioned records |
| 022 | Product lifecycle — "we do not import this" |
| 023 | Retire the legacy flat requirements model |
| 024 | Split FDA product codes across the tables that own them |
| 025 | Classification-request classes for "none of these fit" submissions |

**Confirm 015–025 are actually applied in production before assuming it.**
Migrations are applied by hand in the Supabase SQL editor and this repo cannot
see the database. All FSVP data is dummy/seed, so a destructive correction is
cheap if one turns out to be missing.

**Before adding a column, read the WHOLE table definition in
`000_baseline.sql`.** It is ~1300 lines with long tables. Migration 011 first
failed because `documents.retention_until` already existed — along with
`retention_locked` — declared since the baseline and never used.

Other traps:
- `CREATE OR REPLACE VIEW` cannot reorder or rename columns. Any view over
  `table.*` must be **dropped and recreated** when the table gains a column.
- Make DDL idempotent (`add column if not exists`, `drop trigger if exists`,
  guarded `add constraint`) so a failed migration can be re-run. Do not assume
  an earlier migration ran: 021 had to stop assuming 003 had.
- `types/database.ts` is hand-maintained and partly stale — it declares
  `organization_id` and `foreign_supplier_id` on tables that lack them. Nearly
  every query uses `as any`, so the type system protects very little.
  `npm run supabase:types` exists and its output is gitignored; generating types
  properly would turn a class of runtime bug into a compile error.

---

## 4. Design principles that must be preserved

These are the spine of the product. Breaking them silently is the main risk.

1. **Determinations are dated snapshots, not live queries.** Each records the
   rule version and inputs it was made against. Rules are *copied* onto
   determinations, never joined at read time — a rule superseded next year must
   not rewrite what an importer was told this year.

2. **Nothing auto-attributes.** FDA identifies firms by FEI; we mostly hold
   names and countries. `lib/regulatory/matching.ts` *proposes* candidates with
   a written rationale, and a person confirms. Only `match_status='confirmed'`
   counts anywhere. A country mismatch disqualifies outright; weak resemblances
   are never raised at all.

3. **Refuse rather than guess.** `lib/admissibility/resolve.ts` returns
   `manual_review` — never a determination — for an overdue rule, an unverified
   draft, an unevaluable region-scoped rule, a source seen to change, or two
   equally specific rules that disagree. `lib/fsvp/rule-version.ts` does the
   same one table over: if two published rule sets both claim FSVP records,
   nothing in the data prefers either, and picking by version number is
   arbitrary dressed as a rule. "No rule on file" stays distinct from "a rule we
   cannot rely on"; they call for different actions.

4. **Curated data needs provenance and an expiry.** `country_commodity_rules`
   has NOT NULL `citation`, `source_url`, `reviewed_at`, `review_due_at`. A rule
   past review is readable but not assertable. A rule enters as `draft` and needs
   a *second person* to verify it — transcription errors are invisible to
   whoever made them.

5. **Gates fail closed and say why.** Every blocking condition returns a message
   naming what to do. `evaluateGates` returns *all* blockers at once, not the
   first — fixing one at a time is how a compliance queue becomes a war of
   attrition. A blocker should also *link* to the screen that clears it: a
   message naming a step the reader cannot reach from where they are standing is
   only half a gate.

6. **Empty and zero mean "nothing loaded", not "nothing exists".** Say so in the
   UI. A compliance queue confidently reporting zero findings is a claim.

7. **Verify a code; never derive one.** A product code is not an attribute of a
   commodity — FDA's own example, 38BEE27, encodes the *can* and the *retort*,
   and the same soup in glass is a different code. The Product Code Builder
   client exists to read FDA's reference tables and to verify a code somebody
   already holds, never to backfill `commodities.fda_product_code` from a name.
   The header of `lib/regulatory/product-code-builder.ts` argues this at length;
   read it before extending that client.

8. **Name only what a source defines.** `lib/regulatory/product-code-elements.ts`
   names the container subclasses and the CFSAN process codes it can corroborate
   and leaves the rest as bare letters. Industry 34 uses U, W and X; no source
   consulted defines them, so they render unnamed. A plausible-sounding process
   name on a real entry-line code is exactly the failure that client was built
   to prevent.

---

## 5. What is built

**Phase 1 — complete and enforced.** Approving an FSVP record is blocked by ~10
conditions: applicability determination, active QI, up to three signatures with
matching content hashes, critical requirement items, computable score, supplier
not suspended, § 1.506(d) determination, the SAHCODHA annual-audit rule,
§ 1.507 assurances current, § 1.505 compliance screening current. Gate logic
lives in `lib/fsvp/gates.ts`, `lib/fsvp/qi-attestation.ts`,
`lib/fsvp/applicability.ts`.

**Regulatory intelligence — working end to end.** Four FDA sources ingest,
normalise, store, and propose candidate matches. Alerts now *deliver* to the
people they concern, exactly once (migration 016), and a quiet notification bell
can no longer stall the ingest. See §6.

**Phase 2 items 7–8 — complete workflow, taxonomy seeded, rules still empty.**
Commodity taxonomy (seeded by migration 018), country-commodity rules with
two-person verification, admissibility snapshots, and the blocking gate are
wired into the product journey. Administrators enter draft rules at
`/admin/reference-rules`; importers classify a product and determine
admissibility from its product page. A missing rule reads as *pending review*,
not as a verdict, and an importer who finds nothing that fits can submit a
classification request (migrations 024–025) instead of hitting a dead end.

**Phase 2 item 11 — FDA facility registration renewal.** The 21 CFR 1.230
biennial renewal is tracked, and someone can actually enter the date
(migration 017).

**The importer's own path.** `/setup/fsvp` assembles real gate blockers into an
ordered journey. `/our-records` holds the importer's own FSVP records
(migration 020) and lets procedures be **drafted and edited in place** rather
than uploaded (migration 021). `/entry-readiness` — renamed from
`/shipment-readiness`, which redirects — evaluates a *product*: classification,
origin, admissibility, applicability. There is no shipment entity in the schema,
and holding that name would have cost Phase 3 its own.

**FDA product code capture** (`components/products/ProductFdaCodeCard.tsx`).
Browse FDA's industries and products, or verify a code already held; the
packaging step explains what subclass and PIC mean and names the options where
FDA's tables allow. Options come from the industry-scoped endpoint when it
answers and from the unfiltered table when it does not — see §6.

**Legacy requirements model retired** (migration 023). Two generations of the
same idea had been running side by side; only one remains.

**Structural test suite** — `lib/quality/app-invariants.test.ts` and
`nav-invariants.test.ts` check that server components contain no client-only
constructs, that every page authenticates (or is on a documented exemption
list), that every API route identifies its caller, and that no nav key points at
nothing. Written after two pages were found broken in production. 31 test files
now.

**Tenancy and preview, pinned by tests.** `lib/auth/tenancy.ts`,
`entity-access.ts` and `preview-guard.ts` each exist because inline checks in
two routes disagreed with each other — one of which rejected every facility a US
importer tried to create, and so every product too. An administrator previewing
an account may **look but never write**: evidence is attributed to the supplier
who attested or the importer acting for them, and an admin is neither.

---

## 6. FDA integrations — hard-won specifics

**openFDA** (`api.fda.gov/food/enforcement.json`) — public, no credentials. A
free key raises 1,000/day/IP to 120,000/day. Answers "no matching records" with
**HTTP 404**, which must be treated as an empty page, not an error.

**FDA Data Dashboard** (`api-datadashboard.fda.gov/v1/…`) — needs
`Authorization-User` and `Authorization-Key` headers. Docs at
`datadashboard.fda.gov/oii/api/` (`/ora/api/` 301-redirects there).

- **`statuscode` in the response body is NOT a status.** A live successful
  response was `{"statuscode":400,"message":"Success.","totalrecordcount":7848,
  "resultcount":100,"result":[…100 valid records…]}`. Judge success by whether
  `result` is an array. A *missing* `result` is the error; an empty one is an
  empty page.
- Page size 100. 1000 is rejected; FDA's examples use 10 and 100.
- Date filters are `YYYY-MM-DD` on `<DateColumn>From` / `<DateColumn>To`.
- Volume is high — 7,848 refusals in one four-month window — so all Dashboard
  sources use 30-day windows.

**FDA Product Code Builder** (`accessdata.fda.gov/rest/pcbapi/v1`) — the same
deal as the Dashboard: free, credentialed through OII Unified Logon, but keys
are issued *per application*, so `FDA_PCB_USER` / `FDA_PCB_KEY` are their own
variables and must not borrow the Dashboard pair.

- **403 and 404 are inverted.** On `/productcode/{code}`, FDA's spec defines
  **403 as "valid product code"** and **404 as "invalid product code"**. Read
  them the ordinary way and a good code is reported as a credential failure.
- **400 means "Success"**, as it does next door. Judge by whether a result came
  back, never by the status code.
- **Every request needs a unique `signature` parameter.** Responses are cached
  server-side; without it, a 401 from a bad key is replayed to you long after
  the key is fixed. FDA's own Python example does the same.
- **The industry-scoped endpoints are not dependable.**
  `/productcodeindustry/{id}` was removed in `6b0985d` for returning nothing
  useful, and the scoped subclass and PIC endpoints behave the same way — empty
  dropdowns, no rows to parse. `app/api/products/fda-code/options/route.ts`
  falls back to the unfiltered `/subclass` and `/pic` tables and reports which
  one answered. A few options that do not apply to the industry is a far smaller
  fault than a control with nothing in it, and the code the user finally records
  is verified against FDA either way.
- Column names come back **abbreviated**, and not consistently between
  endpoints.

**No API exists for:** APHIS ACIR (commodity admissibility), FDA import alerts,
FDA FFR/FURLS, FDA Prior Notice. All manual. **Do not build** a CBP ACE/ABI
filer — partner with one.

**Verified as unusable:** openFDA `food/event.json` (CAERS). Records carry no
firm name, manufacturer or country, and brand names are often redacted as
"EXEMPTION 4". Nothing can be attributed to a supplier. Do not add it.

**Not machine-readable at all:** FDA's per-industry process code table. It is
published only through the Product Code Builder web UI, which refuses automated
clients. That is why `PIC_NAMES` is partial and why U, W and X show as letters.

---

## 7. Known gaps, roughly in priority order

1. **Scheduled maintenance has never once succeeded.** Checked on 2026-08-27,
   which the previous version of this entry asked someone to do.
   `.github/workflows/scheduled-compliance.yml` calls `/api/cron/compliance`
   daily. The route runs one bounded FDA ingest window for the requested source
   and calls `public.generate_compliance_alerts()` for reassessments, expiring
   documents and long-open corrective actions.

   It is scheduled and it fires: 14 runs on `main`, all triggered by cron. Every
   one of them **failed**, in five to eight seconds, at the single step. The
   script exits 1 in three places — missing `FSVP_BASE_URL`, missing
   `INGEST_TRIGGER_SECRET`, or `curl --fail-with-body` on a non-2xx response —
   and the logs need a GitHub login to read, so which of the three it is has not
   been established. The first two are repository secrets; the third would most
   likely be a 401 from `INGEST_TRIGGER_SECRET` missing as a **Cloudflare
   runtime binding**, which is the failure §2 warns fails silently.

   The consequence is not subtle: no FDA source has advanced and no compliance
   alert has been generated by schedule, for as long as the workflow has
   existed. Read one run's log, fix whichever of the three it is, then re-run it
   with `workflow_dispatch` rather than waiting a day to find out.

2. **The first-approval path exists, but needs real-user proving.** Two weeks of
   fixes came out of walking it: dead Status columns, exporters unreachable from
   their own facilities, an approval button that silently did nothing, a
   promised email that was never sent. It is far better threaded than it was;
   the remaining risk is whether it holds up with messy tenant data and a user
   who is not its author.

3. **Reference layer rules are still empty, but the table can now hold one.**
   The commodity taxonomy is seeded (migration 018), which was safe because a
   taxonomy asserts nothing. `country_commodity_rules` is not, so admissibility
   correctly answers "pending review" for everything.

   Migration 026 is the precondition, and came out of actually reading three
   ACIR documents: before it, entering one meant altering it — no `pod`, no
   "not for planting", no scope for "all countries", and worst, no way to say
   the source was silent about a phytosanitary certificate rather than that none
   was needed. See `docs/reference-layer-curation.md` §§ 2.2–2.3.

   What is left is the transcription itself, which is deliberately manual.
   `background-documents/acir-exports/` holds a 41-row cocoa worklist; 32 of
   those rows are per-country Cacao Bean Pod documents and one is a prohibition
   covering everyone else, which is a natural pilot. Enter each as a draft and
   have a second administrator verify it against the page.

4. **`types/database.ts` is hand-maintained and wrong in places.** See §3.

5. **Invisible built features.** `fsvp_signature_ledger` — the § 1.510(a)(2)
   evidence for an inspection package — has no UI. `documents.retention_until`
   is enforced but never displayed.

6. **Suppliers have no FEI numbers**, so matching is permanently fuzzy. But
   ingested refusals and inspections *contain* `FEINumber` + `FirmName` +
   `CountryName` — a firm directory could be built from data already stored and
   used to propose exact identities.

7. **Exporters cannot see findings about themselves** and so cannot correct a
   misattributed recall.

8. **No daily-use surface.** Everything built is once-per-supplier
   qualification. `/entry-readiness` evaluates a product, not a shipment; the
   roadmap's "the screen an importer would open every morning" is Phase 3 and
   still does not exist.

---

## 8. Suggested next steps

1. **Fix scheduled maintenance.** It is not unconfirmed any more — it is
   failing, and has been on all 14 runs. Read one run's log, which needs a
   GitHub login, and fix whichever of the three exits it is hitting. Nothing
   else in this list matters as much: no FDA source has advanced on schedule and
   no alert has ever been generated by one.
2. Walk one real importer through `/setup/fsvp` end to end and tighten whatever
   still confuses them.
3. Seed the reference layer narrowly with real APHIS rules for pilot movements;
   enter each as a draft and have a second administrator verify it. The schema
   is ready for them as of 026; start with the cacao pod worklist.
4. Generate `types/database.ts` from Supabase and start deleting `as any`.
5. Then Phase 3 (shipments), which is where daily value lives.

**Defer** Phase 2 items 9–10 (permits, agency routing). Item 11 shipped as
migration 017. More compliance depth on an unusable base compounds the problem.

---

## 9. Conventions

- **Branch → CI green → `--no-ff` merge to `main` → push.** Never merge on red;
  `main` auto-deploys to production. Push after each coherent commit rather than
  hoarding work locally.
- **Commit messages explain *why*, in prose**, including what was considered and
  rejected. Look at recent history for the register.
- **Long explanations belong in the file they explain.** The headers of
  `product-code-builder.ts`, `entity-access.ts`, `rule-version.ts` and
  `preview-guard.ts` each carry the bug or the constraint that produced them.
  That is where the next person is actually standing when they need it.
- **Verify regulatory citations before writing them.** Use
  `law.cornell.edu/cfr/text/21/...` — eCFR 302-redirects and cannot be fetched.
  Two citation errors shipped in one day: signing FSVP records is
  **§ 1.510(a)(2)**, not § 1.510(b); and § 1.507(b) governs what an assurance
  must *carry*, while § 1.507(a)(N) says *which* assurance is needed.
- **Guard tenancy on NOT NULL columns.** `products_verify.importer_id` is
  nullable, and `if (row.importer_id && row.importer_id !== mine)` silently
  permits everything when it is null. Resolve through `supplier_relationships`,
  or use `deniesTenant()` from `lib/auth/tenancy.ts`. The admin client bypasses
  RLS, so handler checks are the only protection.
- **When an external API misbehaves, print its whole response beside the request
  that produced it — first, not third.** Every FDA failure was diagnosed by
  guessing until the error message did that.
