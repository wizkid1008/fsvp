# Curating the reference layer: what can be automated, and what must not be

How `country_commodity_rules` gets populated, verified, and kept honest.

Date: 2026-08-11. Written before seeding any data, deliberately — a curated
table with no curation process is just a stale table that has not aged yet.

---

## 1. The problem this document exists for

The roadmap states the constraint:

> Ingest what has an API, curate what does not, and never present a curated
> table as authoritative without a citation and a review date. A
> country-commodity rule table that silently goes stale is worse than no table
> at all, because it produces confident wrong answers.

Everything below follows from one asymmetry: **an empty table is honest, a wrong
table is dangerous.** An importer told "no rule on file" goes and looks. An
importer told "permitted, no permit required" by a row nobody has checked since
2024 stops looking. The second is worse, and it is the failure this process is
designed around.

---

## 2. What cannot be automated

**APHIS ACIR is the authority, and it has no API.**

The Agricultural Commodity Import Requirements database (`acir.aphis.usda.gov`)
replaced FAVIR and the Plants for Planting and Treatment manuals on 30 September
2024, and is now the single source for commodity entry requirements — treatment
schedules, inspection procedures, additional declarations, designated ports. It
is hosted on Salesforce Experience Cloud, is search-driven, and publishes no
documented API or bulk download.

That means the substance of every rule — *what is actually required* — has to be
read by a person and typed in. There is no version of this that is safely
automated:

- **Scraping is the wrong tool here.** Not primarily because it is fragile, but
  because a scraper that silently mis-parses produces exactly the confident
  wrong answer this table exists to prevent, and does so at scale and without
  anyone reading the output.
- ACIR should be checked before relying on any rule, whatever this table says.
  The platform's job is to record what was checked and when, not to replace the
  check.

If APHIS ever publishes an API or bulk export, this section is the first thing
to revisit. Worth asking: `acirdatabase.comments@usda.gov`.

### 2.1 Probed against the live site, 2026-08-25

The paragraphs above were written without trying. They are right about the
absence of an API and wrong about how closed the site is, which changes the
cost of curation even though it does not change the conclusion.

**ACIR serves fully to an automated browser.** No login, no CAPTCHA, no bot
wall. The seven category searches are deep-linkable
(`/s/acir-global-search-not-for-planting` and siblings), as are
`/s/acir-treatment-search`, `/s/taxon-search`, `/s/acir-port-group` and
`/s/acir-regions`.

**Search results carry facets that nearly match our columns** — Admissibility,
Intended Use, Plant Part, Process Type, PortGroup, Article Type against our
`admissibility`, `intended_use`, `processing_state`, `designated_ports`.

**Every result set exports as CSV**, and the export includes a `Document URL`
column deep-linking each requirement document. So `source_url` — which
`/api/reference-rules` refuses a rule without — comes straight out of the
export rather than being copied by hand.

**But the CSV is an index, not the rules.** Its columns are Document Name, Port
Group, Plant Parts, Process Type, Article Type, Document URL. Nothing in it
says permitted or prohibited, and no permit, phyto or treatment flag appears.
Those live only on the detail page. A CSV is a worklist, not a data source, and
anything built on the assumption that it can be loaded into
`country_commodity_rules` will be loading document titles.

**The detail pages are readable and structured.** A worked example —
`/s/acir-document-detail?rowId=a0jSJ00000S9m8aYAB&…`, "Dried Products from the
Malvales Order", published 2025-10-20 — carries Commodities (including
*Theobroma cacao*), Plant Part, Processed State, Intended Use, Region, Port
Groups, numbered Import Requirements ("No permit is required for this
commodity", "subject to inspection at the port of entry and all general
requirements of 7 CFR 319.56-3"), and an Authority block giving the CFR subpart
with a statute URL. That is a rule row's worth of content, and the citation it
yields is in the exact shape `lib/regulatory/ecfr.ts` already parses.

Two limits found in the same pass. **Some content is gated**: "Officer
Instructions" says *Regulatory Officials Login to ACIR to see more*, so an
anonymous read is not the whole document. And the **`View` button in the
results table failed reproducibly** with a Salesforce error
(`this.formatResults is not a function`, descriptor `c:cirdPortalResultsPdf`)
across two fresh sessions — though the inputs were being set by script, which
can leave a Lightning component's state incomplete, so this may be an artefact
rather than an ACIR fault. It does not block anything: the `Document URL` from
the CSV reaches the same page directly.

**Everything is inside shadow DOM.** It is a Salesforce Lightning Web
Components app, so ordinary automation and accessibility trees see almost
nothing — the home page looks like four links until the shadow roots are walked
by hand. That is the fragility this section warns about, and it argues for
assisted curation (a person runs the search, exports, and reads the detail
page) over any unattended scraper.

ACIR's `robots.txt` **allows everything** — `User-agent: *`, `Allow: /`, one
disallow on Salesforce's `forgotpassword.jsp`, no crawl-delay. It also
advertises `/s/sitemap.xml`, which §2.1 did not know about. That sitemap is
**taxa only**: 22 shards of 20,000 `cird-taxon` URLs each, roughly 440,000
records covering the whole biological taxonomy down to arthropod classes, and
no requirement documents at all. So it is not a shortcut to the rules, and the
`Document URL` column of a CSV export remains the only route to a detail page.

### 2.2 What a detail page actually contains, and where it stops fitting

Three documents were read in full on 2026-08-27, through the shadow roots, to
find out whether a rule row can be built from one: `Dried Cocoa Leaves from All
Countries`, `Cacao Bean Pod (Pod) from Mexico`, and `Cacao Bean Pod from
Inadmissible Countries`. They extract cleanly. The substance is there — the
Mexico document gives Commodities (*Theobroma cacao*), Plant Part, Processed
State, Intended Use, Port Groups, the country, two numbered Import
Requirements ("An Import Permit is required", "subject to inspection at the
port of entry and all general requirements of 7 CFR 319.56-3") and an
Authority block naming 7 CFR 319 Subpart L.

**But `country_commodity_rules` cannot hold it faithfully.** Five mismatches,
found by trying rather than by reading the schema:

1. **`plant_part` has no `pod`.** ACIR's Plant Part for the cacao documents is
   literally "Pod", and 32 of the 41 rows in the cocoa worklist are pods. The
   prohibition document says "All Plant Parts Including Seed", which is also
   unrepresentable. A pod is not a fruit for APHIS purposes, and coercing it
   into `fruit` would silently widen every rule built from these documents.

2. **`processing_state` is single-valued; ACIR is not.** The Mexico document's
   Processed State is "Fresh, Fresh Cut" — one document, two states, and
   `fresh_cut` is not in the enum. Either one document becomes two rule rows,
   or "fresh cut" is dropped on entry.

3. **`intended_use` cannot say "Not for Planting or Propagation".** That is
   ACIR's *primary* search axis — it is the name of the category the whole
   export came from — and it is the negation of an enum value rather than one
   of them. Entering it as `any` asserts the rule covers propagative material,
   which is the opposite of what the document says.

4. **There is no scope for "all countries" or "everywhere else".** The schema
   requires a country XOR a region. "Dried Cocoa Leaves from All Countries" has
   neither. Worse, `Cacao Bean Pod from Inadmissible Countries` is a
   prohibition stated by *enumerating roughly 190 countries* — so one document
   becomes 190 rows, and the day APHIS grants one of them market access, 189
   rows are still right and one is silently wrong.

5. **The schema cannot say "the document does not mention this."**
   `phyto_required boolean not null default false` has no third state, so a
   document that is simply silent about phytosanitary certificates becomes a
   rule asserting that none is required. That is the confident wrong answer
   this table was designed to prevent, arriving through the type system rather
   than through carelessness. The Mexico document says nothing about phyto.

### 2.3 The flattening hazard, demonstrated

The prohibition document is the strongest argument in this file for assisted
curation, because it broke in exactly the way §2 warned about, in the first
attempt, without anyone trying to make it break.

Read through the DOM, its operative sentence came out as:

> This commodity from the countries listed in this document. Therefore, IMPORT
> PERMITS BE ISSUED AT THIS TIME.

The words "does not currently have market access" and "WILL NOT" sit in
separate inline elements and were emitted *after* the sentence that contains
them. Flattened, the text reads as though permits are issued. **A naive
transcription of a prohibition produced a permission.**

Nothing about this is exotic — it is ordinary rich text with emphasis in it,
and any extraction that concatenates nodes in document order is exposed to it.
It is the reason `conditions_text` must be captured with its emphasis intact
and read by a person against the rendered page, and the reason no extraction
of these pages may ever write anything but a draft.

---

## 3. What can be automated

Not the content. The **signal that the content may have moved** — which is most
of the value, because it converts a fixed review interval into a prompt tied to
something actually happening.

### 3.1 Legal text change detection (strongest, do first)

The eCFR publishes a documented public API at
`ecfr.gov/developers/documentation/api/v1`, and tracks point-in-time versions of
each CFR unit. Every rule in our table cites a CFR section — `7 CFR 319.56-…`
and similar.

So: record the CFR part each rule cites, poll the eCFR for the current version
date of that part, and when it changes, flag every rule citing it for review.

This is high-value and low-risk. It never edits a rule; it only says "the law
under this moved on 2026-06-14, go and look." A false positive costs one
re-check; a missed change costs a wrong answer.

### 3.2 Federal Register monitoring

Proposed and final rules affecting 7 CFR 319 are published in the Federal
Register before they reach the CFR, which makes this an earlier warning than
3.1. The Federal Register is understood to offer a public API, **but this was
not verified** — the site blocks automated fetches from this environment, so
confirm the endpoint and terms before building against it.

### 3.3 Source page change detection

Store a checksum of the fetched `source_url` and re-fetch periodically; flag on
change. Crude, and noisy for pages with rotating markup, but it catches
amendments that do not touch the CFR text. Lowest priority of the three, and
only if the page is fetchable at all.

### 3.4 Review scheduling and alerting

Already in the schema — `review_due_at`, `rule_is_current()`, and the
`country_commodity_rules_status` view. What is missing is a screen and a
notification. **Without those, the review dating is a mechanism nobody can act
on**, and the whole design rests on someone actually re-checking.

---

## 4. Confirming: how a rule becomes trustworthy

A rule must not be usable the moment it is typed in. The entry step and the
confirmation step are different acts and should be performed by different
people, for the same reason a QI signature is separate from the record.

**Proposed lifecycle:**

```
draft ──(a second person checks it against ACIR)──> verified ──(review_due_at passes)──> overdue
  │                                                     │
  └── never resolvable                                  └── still readable, not assertable
```

- `draft` — recorded and visible, but **cannot support a determination**. It
  does not behave like no rule: a draft covering the question forces manual
  review, saying "somebody has drafted a rule here, get it verified." Treating
  a draft as absent would let a drafted *prohibition* be stepped over by
  silence, which is the same error as ignoring an unevaluable region rule.
- `verified` — a named person confirmed it against the source on a date. Only
  verified rules can support a determination.
- `overdue` — verified once, past its review date. Readable, not assertable.
  Already implemented.

The verifier must not be the person who entered it. Not because anyone is
suspected, but because transcription errors are invisible to the person who
made them.

---

## 5. Sequencing

Steps 1, 3, 4 and 5 below are **done** — 014 built the verification lifecycle,
`/admin/reference-rules` is the maintenance screen, and `lib/regulatory/ecfr.ts`
does change detection against the live eCFR versioner. What is left is data,
and §2.2 found that the schema is not yet able to receive it honestly.

1. ~~**Schema for verification and change detection**~~ — migration 014.
2. **Schema fidelity to the source** (new, and now first). A rule row must be
   able to say what an ACIR document says: pods, "not for planting", two
   processed states, a scope that is not one country, and above all *silence* —
   see §2.2. Until then, entering a rule means quietly altering it, and every
   later verification would be a person confirming a distortion they cannot
   see, because the screen would show them the distorted version.
3. **Seed a small set as `draft`.** Anything transcribed by an AI from agency
   pages enters unverified by construction and is worthless until a person
   confirms it. This is not a formality: a plausible-looking wrong treatment
   schedule is the worst artefact this system can hold. §2.3 is what that looks
   like when it happens.
4. ~~**The maintenance screen**~~ — `/admin/reference-rules`.
5. ~~**eCFR change detection**~~ — `lib/regulatory/ecfr.ts`, verified against
   the live API on 2026-08-14.
6. Federal Register monitoring, if the API checks out.

---

## 6. The rule of thumb

Automate the *question*, never the *answer*. The platform may say "this looks
like it changed" and "nobody has checked this since March". It may not say "this
is permitted" unless a person put that there and a second person agreed.
