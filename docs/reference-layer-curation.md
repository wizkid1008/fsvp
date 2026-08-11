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

1. **Schema for verification and change detection** — draft/verified state, who
   verified against what, the CFR part for change detection. Before any data.
2. **Seed a small set as `draft`.** Anything transcribed by an AI from agency
   pages enters unverified by construction and is worthless until a person
   confirms it. This is not a formality: a plausible-looking wrong treatment
   schedule is the worst artefact this system can hold.
3. **The maintenance screen** — what is draft, what is overdue, what changed.
4. **eCFR change detection** — the automation with the best ratio of value to
   risk.
5. Federal Register monitoring, if the API checks out.

---

## 6. The rule of thumb

Automate the *question*, never the *answer*. The platform may say "this looks
like it changed" and "nobody has checked this since March". It may not say "this
is permitted" unless a person put that there and a second person agreed.
