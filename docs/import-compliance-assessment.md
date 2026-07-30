# Agricultural Import Compliance — Assessment and Gap Analysis

Assessment of ThrushCross Verify against (Layer 1) the FDA Foreign Supplier Verification
Program, and (Layer 2) the complete process of importing agricultural and food products into
the United States.

Date: 2026-07-30. Baseline: branch `importer-rebuild`, commit `08bd2a4` plus notifications.
Companion: [`import-platform-roadmap.md`](./import-platform-roadmap.md) — architecture, modules,
roles, entities, business rules, roadmap, dashboards, integrations.

---

## 0. The framing that governs everything below

**FSVP compliance is not admissibility, and admissibility is not release.** These are four
independent determinations made by different authorities against different rule sets:

| Determination | Question | Authority | Fails independently |
|---|---|---|---|
| **FSVP compliance** | Can this importer rely on this supplier for this food? | FDA (21 CFR 1 subpart L) | A perfect FSVP record does not make a mango admissible |
| **Product admissibility** | May this commodity from this country enter at all? | USDA APHIS, FDA | A prohibited pest host is inadmissible however good the supplier is |
| **Entry acceptance** | Is the entry filing complete and duties secured? | CBP | Correct FSVP + admissible product still fails on a missing bond or HTS error |
| **Release** | Will the government physically release this container? | CBP, FDA, APHIS | Any agency can hold after everything above is correct |

The current application answers **only the first**, and its data model has no concept of the
other three. That is the single most important finding in this document: the product is not
"75% of an import platform", it is "one of four determinations, built well".

Everything that follows is scored against that framing. A high FSVP score and a low overall
score are not contradictory.

---

## 1. Executive assessment

### 1.1 What the application is today

A **supplier-verification and evidence-management system** for the FSVP obligation, organised
around one durable idea: the `fsvp_records` row, unique per importer + supplier + facility +
product, carrying a locked rule version. That is the right primitive and it is well chosen.

Around it sit a versioned rules engine (`rule_versions`, `requirement_sections`,
`requirement_items`, `scoring_category_weights`), a weighted scoring engine with critical-blocker
semantics, a document vault with review workflow, hazard analysis and verification-activity
tables mapped to §§ 1.504–1.507, approval decisions with history, reassessment scheduling,
corrective actions, and an audit log.

Recent work in this session closed the defects that made much of it non-functional: importer
tenancy (every importer previously shared one organization), the supplier→importer evidence
handoff, approval integrity (approval could be granted on zero evidence), and reporting.

### 1.2 What the application is not

It has **no shipment**. No purchase order, lot, container, entry, entry line, or government
disposition. `import_entries` and `importer_entry_identities` exist as retained schema with no
UI and no writes. There is no commodity taxonomy, no country-commodity rule table, no permit or
certificate register, no label record, no agency routing.

Consequently the application cannot answer the question an importer actually asks each week —
*"can I ship this, and will it clear?"* — only the annual question *"is this supplier
approved?"*.

### 1.3 Coverage estimates

**Assumptions, stated explicitly:**

- Coverage means *a data model, a workflow, and an auditable artifact exist* — not that a field
  exists somewhere.
- Scored against the branch state, including this session's fixes. Against `main` the FSVP
  figure would be materially lower, because tenancy, evidence flow and reporting were broken.
- "Partial" credit is given where the schema exists but no UI writes it, at roughly one third
  weight — schema without workflow does not produce compliance.
- Percentages are judgement, not measurement. Treat ±10 points as noise; treat the *ordering*
  as the signal.

| Area | Coverage | Basis |
|---|---:|---|
| **FDA FSVP compliance** | **60%** | Core loop complete. Missing: qualified individual, applicability/exemptions, compliance-history screening, post-import hazard control, small-entity modified requirements |
| **Supplier & facility qualification** | **70%** | Strong: shared profiles, relationships, managed records, scoring, approval, suspension via `approval_status`. Missing: written approval *procedure* as a versioned artifact, supplier performance history |
| **FDA inspection readiness** | **65%** | Inspection package now assembles; audit log and evidence provenance exist. Missing: record-retention enforcement (2 yr / duration of use), signature ledger, QI attestation |
| **USDA / APHIS admissibility** | **0%** | No commodity taxonomy, no country-commodity rules, no permit register, no phytosanitary handling, no treatment records |
| **Customs & shipment clearance** | **5%** | `import_entries` schema retained, unused. No PO, lot, shipment, container, HTS, valuation, bond, broker |
| **Labeling & market entry** | **0%** | No label entity, no claim substantiation, no COOL marking |
| **Overall agricultural import process** | **~22%** | Weighted across the four determinations in §0, with shipment execution weighted heaviest because it is the operational path |

The gap between 60% (FSVP) and 22% (overall) is the honest headline.

---

## 2. Layer 1 — FSVP requirement-by-requirement

Legend: **●** covered · **◐** partial · **○** missing

| # | Requirement (21 CFR 1 subpart L) | | Current state | Gap to close |
|---|---|:--:|---|---|
| 1 | **Correct FSVP importer** (§ 1.500 definition — owner/consignee at entry, or US agent if none) | ○ | `importers` exists as a tenant. Nothing determines *whether this importer is the FSVP importer* for a given transaction, and there is no US-agent record | Add FSVP-importer determination per supplier-food-shipment: owner/consignee at time of entry, or written-agreement agent. Fields: role at entry, agreement document, effective dates |
| 2 | **Qualified Individual** (§ 1.503) | ○ | `qualified_individuals` and `qi_credentials` were dropped as unused. Hazard analysis has a free-text `performed_by_name` only | Reinstate a QI register: person, education/training/experience basis, credential documents, languages, which records they are qualified to perform. Bind QI to each hazard analysis, evaluation and reassessment as a signed attestation |
| 3 | **Applicability, exemptions, modified requirements** (§§ 1.501, 1.507, 1.512) | ○ | Every product is treated as fully in scope. No exemption logic anywhere | Add an applicability determination per supplier-food: in scope / exempt (juice HACCP, seafood HACCP, LACF for microbiological hazards, alcohol, food for research, transshipment, personal consumption) / modified (very small importer, small foreign supplier from a country with an officially recognised system). Must produce a dated, QI-signed determination record |
| 4 | **Hazard analysis, product- and supplier-specific** (§ 1.504) | ● | `fsvp_plan_hazard_analyses` + `fsvp_plan_hazard_items` with type, severity, probability, SAHCODHA flag, controlling entity, reliance on another party | Largely complete. Add: radiological already present; link each hazard to the specific control and verification activity that addresses it |
| 5 | **Evaluation of food risk and supplier performance** (§ 1.505) | ◐ | Narrative fields plus a weighted score. No structured supplier performance history | Add: supplier compliance history (below), procedural controls in place at the supplier, storage/transport conditions, and a structured evaluation outcome separate from the free-text narrative |
| 6 | **Written supplier approval procedures** (§ 1.505(b)) | ◐ | Approval *decisions* are recorded with rule-version provenance. The written *procedure* itself is not a managed artifact | Add a versioned "supplier approval procedure" document per importer, with effective dates, referenced by each approval decision |
| 7 | **Selection and justification of verification activities** (§ 1.506(d)) | ◐ | `fsvp_verification_records` records activities performed. `verification_determination` is free text | Make the *justification* structured: link chosen activity to the hazard, the SAHCODHA determination, and who controls the hazard — the § 1.506(d)(2) factors. Enforce annual on-site audit when a SAHCODHA hazard is controlled by the supplier, unless a written adequate-alternative justification exists |
| 8 | **On-site audits, sampling, testing, records review** (§ 1.506(e)) | ● | Activity type, scheduled/completed dates, result, SAHCODHA audit flag, document link, next due date | Add auditor competence and independence attestation; add the § 1.506(e)(1)(ii) audit-substitution conditions where an inspection by FDA or a recognised authority substitutes |
| 9 | **Corrective actions and supplier suspension** (§ 1.508) | ◐ | `corrective_actions` with trigger, investigation, action, decision, closure. Suspension expressible via `suppliers.approval_status` | Make suspension a first-class state with effective dates and scope (which foods, which facilities), and make it *blocking* — no shipment or FSVP approval while suspended. Today nothing consumes the status as a gate |
| 10 | **Reevaluation every 3 years or on new information** (§ 1.505(c)) | ◐ | `reassessment_schedules` + `reassessment_due_at`, default 12 months, alerts now generated | Default is 12 months where the regulation says *at least every 3 years*; that is conservative and fine, but add the **event-driven** trigger — new hazard information, supplier non-conformance, recall, import alert — which currently has no mechanism |
| 11 | **FDA compliance-history screening** (warning letters, import alerts, refusals, recalls) | ○ | Nothing. This is a required input to § 1.505(a)(1)(ii) evaluation | Integrate FDA Data Dashboard (import refusals, inspection classifications, compliance actions) and openFDA enforcement. Store snapshots against the supplier and facility with retrieval dates, and feed them into scoring as a risk signal |
| 12 | **Record retention, audit trail, inspection readiness** (§§ 1.510, 1.512(b)(5)) | ◐ | `audit_logs`, document vault with `retention_until`/`retention_locked` columns, inspection package now assembles | Nothing *enforces* retention (2 years after use discontinued) or prevents deletion of records under retention. Add: signature/attestation ledger (§ 1.510(b) requires signed and dated records), English-language availability flag, retention enforcement on delete |
| 13 | **Entry-level FSVP importer identification (name, email, DUNS)** | ◐ | `importers.duns_number` and `importer_entry_identities` exist; nothing writes or transmits them | Build the entry identity workflow: validate DUNS, manage effective-dated changes, and emit the per-line FSV data block (name, email, UFI) plus FSX/RNE determination for the broker. See §3.3 |
| 14 | **Hazards controlled after importation** (§ 1.507(a)(3)–(4), customer assurance) | ○ | No concept. `controlling_entity` on hazard items can say `customer`, but no assurance artifact follows | Add written-assurance records: customer disclosure statement ("not processed to control X"), customer written assurance, and the 2-year assurance renewal cycle. Blocking: cannot rely on customer control without a current assurance on file |
| 15 | **Very small importer, small supplier, dietary supplements, juice/seafood HACCP** | ○ | None of the modified or exempt pathways exist | Add entity-size determination (very small importer: < $1M human food / < $2.5M animal food, 3-yr average, annual reaffirmation) and the modified-requirement path that replaces hazard analysis + verification with written assurance. Add dietary supplement pathways under § 1.511 |

### 2.1 Layer 1 summary

- **Fully covered (2 of 15):** hazard analysis; verification activity execution.
- **Partially covered (7 of 15):** supplier evaluation, approval procedures, verification
  justification, corrective action/suspension, reevaluation, records/audit trail, entry
  identification.
- **Missing (6 of 15):** FSVP importer determination, qualified individual, applicability and
  exemptions, compliance-history screening, post-import hazard control, small-entity pathways.

The three that most change the product's defensibility: **qualified individual** (#2),
**applicability/exemption determination** (#3), and **compliance-history screening** (#11). The
first two are cheap and structural. The third is free public data and is the single most
differentiating addition available.

---

## 3. Layer 2 — agricultural import readiness

### 3.1 Product admissibility (USDA APHIS) — 0%

Nothing in the schema expresses a commodity, a botanical identity, a country-commodity rule, a
pest condition, a permit, or a treatment. `products_verify` holds a free-text `product_name`
with no taxonomy.

**Required determination**, produced *before* a purchase order is approved:

```
commodity + scientific name + origin country/region + intended use + processing state
  → APHIS admissibility status
  → permit requirement (PPQ 587 / 588 / transit)
  → phytosanitary certificate requirement + additional declarations
  → treatment requirement (fumigation, cold, irradiation, hot water)
  → pest-free area / area-freedom recognition
  → designated port and inspection requirement
  → post-entry quarantine requirement
  → prohibited / restricted flag
```

**Data needed:** commodity register (common + scientific name, part of plant, commodity class);
country-commodity-use rule table with effective dates and citation; APHIS permit register;
treatment schedule register (T-numbers); port designation table; pest-free-area declarations.

**Workflow:** an **Admissibility Determination** record — inputs snapshot, rule version applied,
outcome, conditions, evidence required at entry, determined by, determined at, expiry. Blocking:
no PO approval without a current admissible determination.

The critical design point: admissibility is a function of **(commodity, origin, use, processing
state)** — *not* of the supplier. A supplier with a perfect FSVP record can offer an
inadmissible product, and the current model cannot represent that.

### 3.2 FDA food-import requirements — 15%

| Requirement | State |
|---|---|
| Foreign facility registration (FFR) | ◐ `facilities_verify.fda_registration_number` is a free-text field. No biennial renewal cycle, no registration status, no expiry |
| U.S. agent | ○ Not modelled |
| Registration renewal | ○ No renewal tracking (even-year Oct–Dec window) |
| Manufacturer / processor / packer / holder role | ◐ `facility_type` is free text |
| Prior Notice | ○ Not modelled. Belongs to shipment |
| Food category classification | ○ No FDA product-code taxonomy |
| LACF / acidified food registration (FCE/SID) | ○ Not modelled |
| Produce Safety Rule applicability | ○ Not modelled |
| Seafood / juice HACCP | ○ Not modelled (also an FSVP exemption path — see #3 above) |
| Animal food | ◐ `importers.food_scope` exists; no rule differentiation |
| Dietary supplements | ○ Not modelled |
| Allergen controls | ◐ `products_verify.allergen_information` free text |
| Holds, exams, sampling, detention, refusal | ○ Not modelled |

### 3.3 Customs and CBP — 5%

Only `import_entries` and `importer_entry_identities` exist, both unwritten. Everything else —
importer of record, broker, bond, HTS, valuation, origin, duties, quota, preference, AD/CVD,
ACE entry lines, commercial documents, dispositions — is absent.

**Reality constraint that shapes the design:** ABI is the only approved method of filing entry
in ACE, and requires CBP certification as a filer or a certified software vendor. **This
platform should not become a filer.** It should produce a complete, consistent **broker
instruction package** and receive status back. That is achievable, valuable, and carries no
regulatory gatekeeper.

The one CBP-adjacent thing the platform *should* own is the **FSVP entry data block** (§ 1.509):
importer name, email, DUNS, and the FSV / FSX / RNE affirmation per entry line — because that
determination is a *compliance* judgement, not a customs one, and the broker is simply
transmitting what the importer tells them.

### 3.4 Labeling and market entry — 0%

No label entity exists. Needs: label version record per product-market, with artwork,
declared identity, net quantity, ingredient statement, allergen declaration, Nutrition Facts
panel data, responsible-party name and address, country-of-origin marking, English-language
confirmation, storage/handling, lot coding scheme, and a claims register (organic, non-GMO,
gluten-free, natural, healthy) with substantiation documents and certifying-body references.

Review workflow: draft → reviewed → approved-for-market, with a blocking rule that no shipment
proceeds against an unapproved label version.

### 3.5 Other agencies — 0%

No routing exists. Needed: a rule-driven **agency determination** producing the set of agencies
with jurisdiction over a given commodity-origin-use combination — APHIS, FSIS, AMS, FDA, CBP,
TTB, FWS, EPA, and state authorities — each with its own required artifacts. FSIS in particular
is an entirely separate regime (eligible country/establishment lists, import inspection) that
the current model cannot express at all.

### 3.6 Shipment-level architecture — 0%

The chain the user describes is the correct one, and none of it exists beyond the first four
nodes:

```
importer → FSVP importer → supplier → facility → approved product   [EXISTS]
  → purchase order → lot → shipment → container                     [MISSING]
  → customs entry → entry line → government disposition             [MISSING]
```

This is the largest single gap and the one that converts the product from a compliance
repository into an operational system.

---

## 4. Consolidated gap-analysis table

Priority: **P1** blocks credible FSVP claims · **P2** blocks operational use · **P3** enhances.
Complexity: **S** ≤2 weeks · **M** 2–6 weeks · **L** > 6 weeks.

| # | Requirement | Agency | Coverage | Gap | Recommended feature | Key data fields | Documents | Workflow / approval | Pri | Cx |
|---|---|---|---|---|---|---|---|---|:--:|:--:|
| 1 | Qualified Individual | FDA | ○ | No QI register or attestation | **QI Register** | person, qualification basis, training, experience, languages, scope | CV, training certificates | QI signs each hazard analysis, evaluation, reassessment | P1 | S |
| 2 | FSVP applicability & exemptions | FDA | ○ | All products assumed in scope | **Applicability Determination** | in-scope / exempt / modified, exemption basis, citation, effective date | Supporting basis docs | QI determines; blocks record creation until set | P1 | M |
| 3 | Compliance-history screening | FDA | ○ | No refusal/recall/import-alert data | **Regulatory Intelligence** | firm identifiers, refusal history, import alerts, recalls, inspection classification, retrieved-at | Snapshot exports | Auto-refresh; feeds scoring; alerts on new adverse events | P1 | M |
| 4 | Supplier suspension as a gate | FDA | ◐ | Status exists, nothing enforces it | **Blocking suspension state** | suspension scope, effective from/to, reason | Suspension notice | Blocks FSVP approval and shipment | P1 | S |
| 5 | Post-import hazard control | FDA | ○ | No assurance artifacts | **Written Assurance Register** | assurance type, customer, food, expiry (2 yr) | Signed assurance, disclosure statement | Blocks reliance on customer control without current assurance | P1 | M |
| 6 | Record retention & signature | FDA | ◐ | No enforcement, no signature ledger | **Retention + attestation** | retention_until, signed_by, signed_at, record hash | — | Prevents deletion under retention; signs records per § 1.510(b) | P1 | M |
| 7 | Entry FSVP identification | FDA/CBP | ◐ | Schema unused | **Entry Identity + FSV block** | DUNS, contact, effective dates, FSV/FSX/RNE per line | — | Produces broker data block; pre-entry check against approved record | P1 | M |
| 8 | Very small importer / small supplier | FDA | ○ | No size pathways | **Entity Size Determination** | 3-yr average sales, currency, reaffirmation date | Financial attestation | Annual reaffirmation; switches to modified requirements | P2 | M |
| 9 | Product admissibility | APHIS | ○ | No commodity or country rules | **Product Admissibility** | commodity, scientific name, origin region, use, processing state | APHIS permit, phyto cert, treatment cert | Determination before PO approval | P2 | L |
| 10 | Permits & certificates | APHIS/FDA | ○ | No register | **Permit & Certificate Management** | type, number, issuer, scope, validity, conditions | Permit PDF, certificates | Expiry alerts; blocks shipment when required cert missing | P2 | M |
| 11 | FDA facility registration | FDA | ◐ | Free-text number only | **FFR Module** | registration number, status, expiry, US agent, roles | Registration confirmation | Biennial renewal cycle; blocks shipment if lapsed | P2 | M |
| 12 | Prior Notice | FDA | ○ | Not modelled | **Prior Notice tracking** | confirmation number, submission time, mode, arrival | PN confirmation | Blocks arrival readiness without confirmation | P2 | M |
| 13 | Label compliance | FDA/USDA | ○ | No label entity | **Label Compliance** | identity, net qty, ingredients, allergens, NFP, responsible party, COOL, claims | Artwork, claim substantiation | Review → approve per market; blocks shipment | P2 | L |
| 14 | Shipment & lot management | all | ○ | No shipment concept | **Shipment & Lot** | PO, lot, quantity, container, vessel, ports, ETA/ATA | Invoice, packing list, BOL/AWB | Readiness gate; blocks approval on missing/expired inputs | P2 | L |
| 15 | Customs broker package | CBP | ○ | Nothing | **Broker Package** | IOR, bond, HTS, value, origin, quota, preference, AD/CVD | Full document set | Generates instruction package; broker confirms | P2 | L |
| 16 | Government hold & release | FDA/CBP/APHIS | ○ | Nothing | **Hold & Release Tracking** | agency, action, date, reason, resolution | Notice of action | Tracks to release / refusal / re-export / destruction | P3 | M |
| 17 | Agency routing | all | ○ | Nothing | **Agency Determination** | commodity, origin, use → agency set | — | Drives which modules apply | P3 | M |
| 18 | Verification justification | FDA | ◐ | Free text | Structured § 1.506(d) factors | hazard link, SAHCODHA, controlling entity, chosen activity, rationale | — | Enforces annual audit for supplier-controlled SAHCODHA | P2 | S |
| 19 | Written approval procedure | FDA | ◐ | Not an artifact | Versioned procedure document | version, effective dates | Procedure PDF | Referenced by each approval decision | P3 | S |
| 20 | Event-driven reassessment | FDA | ◐ | Time-based only | Trigger engine | trigger type, source event | — | Opens reassessment on recall, import alert, non-conformance | P2 | M |

---

## 5. What can be determined automatically vs. what cannot

This distinction should be enforced in the UI, not left to interpretation.

**Platform can determine automatically (deterministic, from data):**
Score and threshold outcome · document expiry and renewal windows · reassessment due dates ·
missing required evidence per rule version · supplier suspension state · FSVP record
completeness · whether a permit or certificate is present and current · whether a label version
is approved · HTS *candidates* (not the final classification) · agency routing from a rule table
· compliance-history retrieval and flagging.

**Requires a Qualified Individual's judgement (must be signed, never auto-derived):**
Hazard identification and whether a hazard requires a control · SAHCODHA determination ·
supplier evaluation outcome · choice and justification of verification activities · adequacy of
a supplier's preventive controls · corrective-action adequacy · FSVP applicability and exemption
determination · reassessment conclusions.

**Requires customs-broker confirmation (advisory only from the platform):**
Final HTS classification · customs value and valuation method · country of origin for marking
and duty purposes · AD/CVD applicability · quota and preference eligibility · bond sufficiency ·
entry type and filing mechanics.

**Requires a government decision (the platform can only record it):**
APHIS import permit issuance · phytosanitary certificate from the origin NPPO · treatment
certification · FDA Prior Notice confirmation number · FDA/APHIS/CBP examination outcome, hold,
detention, release, refusal · FSIS eligibility · organic certification.

Presenting any item from the second, third or fourth group as an automatic platform output
would be the most damaging thing this product could do. The UI should visibly label each
determination with its type and who owns it.

---

## 6. Honest limitations of this assessment

- Percentages are informed judgement over the codebase, not measurement against a control
  framework. Ordering is reliable; absolute values are not.
- Regulatory citations are given as orientation, not legal advice. Every determination pathway
  here should be reviewed by a qualified FSVP Individual and, for Layer 2, by a licensed customs
  broker before being built into blocking logic.
- Layer 2 scope is large enough that "0% coverage" understates the position: several areas
  (FSIS, TTB, FWS) are separate regulatory regimes rather than features, and each would be a
  project in its own right.
