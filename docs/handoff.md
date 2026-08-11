# FSVP Platform — Development Handoff

Current as of 2026-08-11. `main` at `dad4f9f`. No unmerged branches.

---

## 1. What this is

**ThrushCross Verify** — a compliance platform for US food importers subject to
the FDA Foreign Supplier Verification Program (21 CFR Part 1, Subpart L). It
holds supplier qualification records, evidence, FSVP determinations, and now
commodity admissibility.

Regulatory context drives most design decisions. When a choice is between
"convenient" and "defensible in an FDA inspection", pick defensible.

---

## 2. Environment — read this first

**There is no Node toolchain on the maintainer's machine.** No `node`, `npm`,
`npx`, `gh`, or `node_modules`. You cannot run typecheck, tests, or builds
locally. **CI is the only feedback loop**, ~2–4 minutes per push. Batch related
work onto one branch rather than pushing per-fix.

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
  `FDA_DATADASHBOARD_USER`, `FDA_DATADASHBOARD_KEY`, `OPENFDA_API_KEY`.

A build-scope-only service-role key is `undefined` at request time, so
`createAdminSupabaseClient()` throws and **all 13 pages that call it break at
once**. Same symptom if the value merely contains `xxxxx` (treated as a
placeholder).

**Two things that look like evidence and are not:** `/dashboard` and `/account`
loading prove nothing — the first only builds the admin client when previewing a
supplier account, the second never uses it. And a stable Next error digest across
deploys means an unchanged *message*, not a stale build.

---

## 3. Database

Migrations `000`–`014`, **all applied**. `000_baseline.sql` consolidates the
original 44 (archived under `supabase/migrations/archive/`).

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

**Before adding a column, read the WHOLE table definition in
`000_baseline.sql`.** It is ~1300 lines with long tables. Migration 011 first
failed because `documents.retention_until` already existed — along with
`retention_locked` — declared since the baseline and never used.

Other traps:
- `CREATE OR REPLACE VIEW` cannot reorder or rename columns. Any view over
  `table.*` must be **dropped and recreated** when the table gains a column.
- Make DDL idempotent (`add column if not exists`, `drop trigger if exists`,
  guarded `add constraint`) so a failed migration can be re-run.
- `types/database.ts` is hand-maintained and partly stale — it declares
  `organization_id` and `foreign_supplier_id` on tables that lack them. Nearly
  every query uses `as any`, so the type system protects very little.
  Generating types from Supabase would turn a class of runtime bug into a
  compile error.

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
   equally specific rules that disagree. "No rule on file" stays distinct from
   "a rule we cannot rely on"; they call for different actions.

4. **Curated data needs provenance and an expiry.** `country_commodity_rules`
   has NOT NULL `citation`, `source_url`, `reviewed_at`, `review_due_at`. A rule
   past review is readable but not assertable. A rule enters as `draft` and needs
   a *second person* to verify it — transcription errors are invisible to
   whoever made them.

5. **Gates fail closed and say why.** Every blocking condition returns a message
   naming what to do. `evaluateGates` returns *all* blockers at once, not the
   first — fixing one at a time is how a compliance queue becomes a war of
   attrition.

6. **Empty and zero mean "nothing loaded", not "nothing exists".** Say so in the
   UI. A compliance queue confidently reporting zero findings is a claim.

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
normalise, store, and propose candidate matches. See §6.

**Phase 2 items 7–8 — built, no data.** Commodity taxonomy, country-commodity
rules with verification, admissibility determinations with a blocking gate, and
a rule-maintenance screen at `/admin/reference-rules`.

**Structural test suite** — `lib/quality/app-invariants.test.ts` checks that
server components contain no client-only constructs, every page authenticates
(or is on a documented exemption list), and every API route identifies its
caller. Written after two pages were found broken in production.

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

**Cloudflare Workers cannot run all sources at once** (Error 1102, worker
exceeded resource limits). One source per request, each advancing a bounded
window, repeated until `caught_up`. A killed worker cannot mark its own run
failed, so a new run first closes out any run left `running` over 15 minutes.

**No API exists for:** APHIS ACIR (commodity admissibility), FDA import alerts,
FDA FFR/FURLS, FDA Prior Notice. All manual. **Do not build** a CBP ACE/ABI
filer — partner with one.

**Verified as unusable:** openFDA `food/event.json` (CAERS). Records carry no
firm name, manufacturer or country, and brand names are often redacted as
"EXEMPTION 4". Nothing can be attributed to a supplier. Do not add it.

---

## 7. Known gaps, roughly in priority order

1. **Nothing runs on a schedule.** No cron anywhere. Ingest happens only when an
   admin clicks. Assurances, screenings, determinations, rule reviews,
   reassessments and document retention all carry expiry dates and **nothing
   watches any of them**. Cloudflare Pages has no cron triggers; the workable
   path is a scheduled GitHub Actions workflow calling the ingest endpoint,
   which needs machine authentication (proposed: an `INGEST_TRIGGER_SECRET`
   binding, constant-time compared, with the header path disabled entirely when
   the variable is unset).

2. **No path to a first approved record.** Ten gates, each needing prior setup
   on a different screen, in an order nobody is told. `evaluateGates` already
   returns every blocker with an actionable message — that data is assembled
   nowhere as a journey. **This is the biggest product risk**: a tool that only
   says no gets routed around.

3. **Half-built Phase 2 UI.** Rule entry has API routes
   (`/api/reference-rules`, `/api/commodities`) and **no form**. Products cannot
   be classified against the taxonomy, and nothing can be determined until
   `commodity_id` is set.

4. **Reference layer is empty.** Admissibility correctly answers "no rule on
   file" for everything. Seeding needs real APHIS citations, entered as drafts
   for human verification.

5. **Invisible built features.** `fsvp_signature_ledger` (the § 1.510(a)(2)
   evidence for an inspection package) has no UI. `documents.retention_until` is
   enforced but never displayed.

6. **Suppliers have no FEI numbers**, so matching is permanently fuzzy. But
   ingested refusals and inspections *contain* `FEINumber` + `FirmName` +
   `CountryName` — a firm directory could be built from data already stored and
   used to propose exact identities.

7. **Exporters cannot see findings about themselves** and so cannot correct a
   misattributed recall.

8. **No daily-use surface.** Everything built is once-per-supplier
   qualification. The roadmap's own "shipment readiness — the screen an importer
   would open every morning" is Phase 3 and does not exist.

---

## 8. Suggested next steps

1. Finish the rule-entry form and product classification — half-built is the
   worst state, and it makes Phase 2 usable end to end.
2. Build the guided path to a first approved record.
3. Scheduled ingest and expiry alerting.
4. Seed the reference layer with verified APHIS rules.
5. Then Phase 3 (shipments), which is where daily value lives.

**Defer** Phase 2 items 9–11 (permits, agency routing, facility registration).
More compliance depth on an unusable base compounds the problem.

---

## 9. Conventions

- **Branch → CI green → `--no-ff` merge to `main` → push.** Never merge on red;
  `main` auto-deploys to production.
- **Commit messages explain *why*, in prose**, including what was considered and
  rejected. Look at recent history for the register.
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
