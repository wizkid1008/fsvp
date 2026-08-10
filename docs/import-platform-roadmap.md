# Agricultural Import Platform — Target Architecture and Roadmap

Companion to [`import-compliance-assessment.md`](./import-compliance-assessment.md), which
scores the current application. This document covers the target state: architecture, modules,
roles, data model, business rules, roadmap, dashboards, and agency integrations.

Date: 2026-07-30.

---

## 1. Architecture principle

Four independent determination engines feeding one shipment gate:

```
                 ┌──────────────────────────────────────────────┐
   REFERENCE     │ commodity taxonomy · country-commodity rules  │
   LAYER         │ agency rules · HTS · FDA product codes        │
   (versioned,   │ treatment schedules · port designations       │
    dated)       └──────────────────────────────────────────────┘
                        │           │            │
        ┌───────────────┼───────────┼────────────┼───────────────┐
        ▼               ▼           ▼            ▼               ▼
  ┌───────────┐  ┌────────────┐ ┌────────┐ ┌──────────┐  ┌─────────────┐
  │   FSVP    │  │ ADMISSI-   │ │ LABEL  │ │  AGENCY  │  │  ENTRY /    │
  │ DETERMIN- │  │  BILITY    │ │COMPLI- │ │ ROUTING  │  │  CUSTOMS    │
  │  ATION    │  │DETERMIN-   │ │ ANCE   │ │          │  │  READINESS  │
  │           │  │  ATION     │ │        │ │          │  │             │
  │ supplier  │  │ commodity  │ │product │ │commodity │  │ entry line  │
  │ × food    │  │ × origin   │ │× market│ │× origin  │  │ × broker    │
  └─────┬─────┘  └─────┬──────┘ └───┬────┘ └────┬─────┘  └──────┬──────┘
        └──────────────┴────────────┴───────────┴───────────────┘
                                    ▼
                        ┌───────────────────────┐
                        │   SHIPMENT GATE       │
                        │ all determinations    │
                        │ current & satisfied   │
                        │ → release to broker   │
                        └───────────────────────┘
```

Three rules govern this:

1. **Determinations are dated snapshots, not live queries.** Each records the rule version and
   inputs it was made against, so an FDA investigator sees what was known at the time.
2. **Determinations expire.** Admissibility rules change; permits lapse; assurances renew every
   two years. Expiry is a first-class field everywhere.
3. **The shipment gate is a conjunction, never an override.** No role may approve a shipment
   whose determinations are incomplete. A documented deviation is a *recorded exception with a
   reason*, not a bypass.

The existing rules-engine pattern (`rule_versions` → `requirement_sections` →
`requirement_items` → `scoring_category_weights`, with published versions immutable) is the
right pattern for all four engines and should be generalised rather than duplicated.

---

## 2. New modules

| Module | Purpose | Depends on |
|---|---|---|
| **Product Admissibility** | Determines whether a commodity from an origin, for an intended use and processing state, may enter | Commodity taxonomy, country-commodity rules |
| **Agency & Rule Determination** | Resolves which agencies have jurisdiction and which rule sets apply | Reference layer |
| **FSVP Applicability & Exemption** | In scope / exempt / modified, with basis and citation | QI register |
| **Qualified Individual Register** | People qualified to make FSVP determinations, and their attestations | — |
| **Permit & Certificate Management** | APHIS permits, phytosanitary, treatment, organic, health certificates | Admissibility |
| **FDA Facility Registration** | FFR number, status, biennial renewal, US agent, roles | — |
| **Label Compliance** | Label versions per product-market, claims and substantiation | — |
| **Shipment & Lot Management** | PO → lot → shipment → container | All determinations |
| **Customs Broker Package** | Assembles and transmits the instruction set; receives status | Shipment |
| **Government Hold & Release** | Agency actions from hold through release, refusal, re-export, destruction | Shipment |
| **Regulatory Intelligence & Alerts** | FDA refusals, import alerts, recalls, inspection classifications; rule-change monitoring | External APIs |

Existing modules to keep and extend: FSVP Records, Supplier & Facility Qualification, Evidence
Vault, Verification Activities, Corrective Actions, Reassessment, Scoring, Audit Log.

---

## 3. User roles and permissions

| Role | Can do | Cannot do |
|---|---|---|
| **Importer administrator** | Manage the organization, users, suppliers, products, shipments; approve shipments; view everything in the tenant | Sign QI determinations; set final HTS |
| **FSVP qualified individual** | Create and sign hazard analyses, supplier evaluations, applicability determinations, verification justifications, reassessments; approve/suspend suppliers | Approve shipments (separation of duties); alter customs data |
| **Foreign supplier (exporter)** | Maintain own company profile, facilities, products; upload evidence; respond to corrective actions and revision requests | See other importers' data; see their own risk scores or evaluation narratives |
| **Production facility** | Upload facility-scoped evidence; maintain facility profile and registration data | See commercial terms, pricing, or other facilities |
| **Customs broker** | View the broker package for shipments assigned to them; confirm HTS/value/origin; report entry number, status, and government actions | Alter FSVP determinations or supplier approvals |
| **Laboratory** | Upload test results and certificates of analysis against a specified lot or shipment | See anything beyond the assigned request |
| **Auditor** | Upload audit reports; record audit scope, dates, findings, and competence/independence attestation | Approve suppliers or close corrective actions |
| **Compliance reviewer** | Review evidence, recommend decisions, comment across tenants where assigned | Make final approval decisions unless also QI |
| **Regulatory administrator** | Maintain the reference layer — commodity taxonomy, country-commodity rules, agency rules, rule versions | See tenant commercial data |

Two structural points: the **QI and the shipment approver should be different people** (the QI
attests to food safety, the administrator accepts commercial risk), and **broker, laboratory and
auditor are external parties** who need scoped, time-limited access to specific records — not
tenant-wide accounts.

---

## 4. Data model additions

Existing entities retained: `importers`, `profiles`, `suppliers`, `supplier_relationships`,
`facilities_verify`, `products_verify`, `documents`, `fsvp_records`,
`fsvp_plan_hazard_analyses/items`, `fsvp_verification_records`, `approval_decisions`,
`reassessment_schedules`, `corrective_actions`, `scoring_results`, rules-engine tables,
`audit_logs`, `compliance_alerts`, `importer_entry_identities`, `import_entries`.

### Reference layer (global, versioned, no tenant)

| Entity | Key fields |
|---|---|
| `commodities` | common_name, scientific_name, commodity_class, plant_part, is_propagative |
| `country_commodity_rules` | commodity_id, origin_country, region, intended_use, processing_state, admissibility (prohibited/restricted/permitted), permit_required, phyto_required, treatment_required, additional_declarations, designated_ports, peq_required, citation, effective_from/to |
| `agency_rules` | commodity_id, origin, use → agency, rule_set, artifacts_required |
| `treatment_schedules` | t_number, description, commodity scope, parameters |
| `hts_codes` | code, description, duty_rate, quota_flag, adcvd_flag |
| `fda_product_codes` | code, industry, class, subclass |

### Qualification and determination

| Entity | Key fields |
|---|---|
| `qualified_individuals` | importer_id, profile_id, name, qualification_basis, education, training, experience, languages, scope[], active_from/to |
| `qi_attestations` | qi_id, record_type, record_id, statement, signed_at, signature_hash |
| `fsvp_applicability_determinations` | importer_id, supplier_id, product_id, status (in_scope/exempt/modified), basis, citation, determined_by_qi, determined_at, expires_at |
| `entity_size_determinations` | importer_id, category (very_small_importer/small_supplier), three_year_average, currency, reaffirmed_at |
| `written_assurances` | importer_id, type (customer_disclosure/customer_assurance/supplier), counterparty, food scope, signed_at, expires_at, document_id |
| `admissibility_determinations` | importer_id, product_id, commodity_id, origin, use, processing_state, outcome, conditions[], rule_version, determined_at, expires_at |
| `supplier_compliance_history` | supplier_id/facility_id, source (refusals/import_alert/recall/inspection), event_date, detail, retrieved_at |

### Permits, certificates, labels

| Entity | Key fields |
|---|---|
| `permits` | importer_id, type, number, issuer, scope (commodity/origin), conditions, valid_from/to, document_id |
| `certificates` | shipment_id or lot_id, type (phyto/treatment/health/origin/organic/COA), number, issuer, issued_at, expires_at, document_id |
| `fda_facility_registrations` | facility_id, registration_number, status, expires_at, us_agent_name, us_agent_contact, roles[] |
| `label_versions` | product_id, market, version, status, identity, net_quantity, ingredients, allergens, nfp_json, responsible_party, cool_marking, language_confirmed, approved_by, approved_at |
| `label_claims` | label_version_id, claim_type, substantiation_document_id, certifying_body, valid_to |

### Shipment chain

| Entity | Key fields |
|---|---|
| `purchase_orders` | importer_id, supplier_id, po_number, incoterms, currency, status, issued_at |
| `po_lines` | po_id, product_id, quantity, uom, unit_price, admissibility_determination_id |
| `lots` | product_id, facility_id, lot_code, production_date, expiry_date, quantity |
| `shipments` | importer_id, po_id, supplier_id, mode, vessel/flight, container_numbers[], port_of_lading, port_of_entry, etd, eta, ata, status |
| `shipment_lines` | shipment_id, po_line_id, lot_id, quantity, hts_code, declared_value, country_of_origin |
| `customs_entries` | shipment_id, entry_number, entry_type, ior_id, broker_id, bond_id, filed_at, released_at |
| `entry_lines` | entry_id, shipment_line_id, hts_code, value, duty, fsvp_affirmation (FSV/FSX/RNE), fsvp_importer_duns |
| `government_actions` | entry_id or shipment_id, agency, action (hold/exam/sample/detain/release/refuse/re-export/destroy), issued_at, reason, resolved_at, document_id |
| `broker_packages` | shipment_id, broker_id, generated_at, payload_json, confirmed_at, confirmed_by |

Relationship spine, as requested:

```
importers ─< fsvp_records >─ suppliers ─< facilities_verify ─< products_verify
    │                                                              │
    └─< purchase_orders ─< po_lines ─────────────────────────────┘
                              │
                         lots ─< shipment_lines >─ shipments ─< customs_entries ─< entry_lines
                                                        │                              │
                                                  certificates              government_actions
```

---

## 5. Business rules and blocking conditions

These are the controls that make the platform worth having. Each should be enforced
server-side, produce a named reason, and be visible in the UI before the user attempts the
action.

### Supplier approval — blocked when
- No qualified individual has signed the hazard analysis or supplier evaluation
- FSVP applicability determination is absent or expired
- Critical requirement items are unsatisfied (**already implemented**)
- Scoring cannot be computed (**already implemented — fails closed**)
- Supplier is suspended
- A SAHCODHA hazard is controlled by the supplier and no annual on-site audit exists, without a
  documented adequate-alternative justification
- Reliance on customer control is claimed without a current written assurance

### Product approval — blocked when
- No admissibility determination, or it has expired, or its outcome is prohibited
- A required APHIS permit is absent or expired
- Label version for the destination market is not approved
- FDA facility registration for the producing facility is lapsed

### Shipment approval — blocked when
- Any of the above is unsatisfied for the supplier, product or facility on the shipment
- Required certificates for the determination are missing or expired at the *expected arrival
  date*, not merely today
- Prior Notice confirmation is absent within the required window
- Lot codes are missing where traceability is required
- FSVP importer identity (name, email, DUNS) is incomplete for any entry line requiring FSV
- Broker package is unconfirmed
- An unresolved government hold exists on a prior shipment from the same supplier-product where
  the cause is unresolved

### Automatic state transitions
- Document expiry → evidence status `expired` → affected scores marked stale → alert
- Reassessment due date reached → record status `reassessment_due` → alert
- Recall or import alert matching a supplier → open corrective action + trigger reassessment
- Supplier suspension → all in-flight shipments flagged for review
- Permit expiry → dependent admissibility determinations marked expired

### Exception handling
Every block should support a **recorded exception**: who overrode, why, which determination,
with an expiry. An exception is an auditable event, not a silent bypass, and exceptions should
appear on their own dashboard.

---

## 6. Roadmap

### Phase 1 — Complete the core FSVP platform *(2–3 months)*

Closes the P1 gaps so the FSVP claim is defensible. Highest value per unit of effort.

1. **Qualified Individual register + attestation ledger** — QI records, credentials, and signed
   attestations bound to hazard analyses, evaluations and reassessments.
2. **FSVP applicability & exemption determination** — in scope / exempt / modified, with basis
   and citation; blocks record creation until determined.
3. **Regulatory intelligence** — FDA Data Dashboard and openFDA feeds into supplier and facility
   compliance history, wired into scoring and alerting. *The most differentiating single item on
   this list.* **Partially delivered — migration `009`.** Corrections found while building it,
   which the rest of this document has been updated to reflect:
   - The Data Dashboard API is free but **not** ungated, as this line originally claimed. Every
     request needs `Authorization-User` and `Authorization-Key` headers issued through FDA's OII
     Unified Logon, which covers import refusals, inspection classifications and compliance
     actions — three of the five datasets. Only openFDA recalls is ingested today.
   - **Import alerts have no API at all.** They are web-only, so a supplier showing no findings
     has not been screened against them. The UI says so rather than implying a clean sweep.
   - Matching is the hard part, not the fetching. FDA identifies firms by FEI; we mostly hold
     names and countries, and `fda_registration_number` is a *different* identifier that cannot
     be joined against FEI. So matches are proposed and a person confirms them; nothing
     auto-attributes. A false positive puts another company's recall on a supplier's record.
4. **Suspension as a blocking state**, written assurances for post-import control, structured
   § 1.506(d) verification justification, event-driven reassessment triggers.
5. **Record retention enforcement and signature ledger** — § 1.510(a)(2) requires signed and dated
   records; retention must prevent deletion.
6. Finish the outstanding items from the current plan: readiness per supplier, importer
   dashboard parity, nav and onboarding coherence.

**Exit criterion:** an FSVP record cannot be approved without a QI signature, an applicability
determination, and a current compliance-history screen. **Met.** All three are enforced
server-side in `/api/fsvp-records/[id]/approve`: the signature gate in `lib/fsvp/qi-attestation.ts`,
the applicability gate in `lib/fsvp/applicability.ts`, and the screening gate — along with
suspension, § 1.506(d) and § 1.507 — in `lib/fsvp/gates.ts`. Each blocks with a named reason that
the record page shows before the user attempts the action.

Two qualifications on "met", both deliberate. The screening and § 1.506(d) gates apply to
**in-scope** foods only, because § 1.512 replaces that work with written assurance for
modified-requirement records. And **import alerts are still screened by hand** — FDA publishes no
API, so a screening records them as not covered rather than implying a clean sweep.

### Phase 2 — Agricultural product admissibility *(3–4 months)*

7. Commodity taxonomy and country-commodity rule tables, maintained by a regulatory
   administrator, versioned and dated like the FSVP rules engine.
8. **Product Admissibility Determination** workflow, blocking PO approval.
9. **Permit & Certificate Management** with expiry alerting.
10. **Agency & Rule Determination** routing.
11. FDA facility registration lifecycle with biennial renewal.

**Exit criterion:** a documented admissibility determination exists before any purchase order is
approved, and prohibited commodity-origin combinations are blocked outright.

### Phase 3 — Shipment and customs management *(4–6 months)*

12. Purchase orders, lots, shipments, containers.
13. Shipment readiness gate implementing §5 above.
14. **Customs Broker Package** generation and confirmation loop.
15. Prior Notice tracking; entry and entry-line records; FSV/FSX/RNE affirmation block.
16. **Government Hold & Release** tracking through to final disposition.
17. **Label Compliance** module.

**Exit criterion:** a shipment cannot be approved with a missing or expired input, and the
broker receives a complete, consistent instruction package.

### Phase 4 — Integrations and regulatory automation *(ongoing)*

18. Broker platform integration (CargoWise, Descartes, NetCHB) for status exchange — partner,
    do not become an ABI filer.
19. D&B Direct+ for DUNS validation.
20. Rule-change monitoring against Federal Register and agency bulletins.
21. Supplier portal automation, laboratory result ingestion, auditor scheduling.

---

## 7. Dashboards and reports

| Dashboard | Answers | Key signals |
|---|---|---|
| **Supplier compliance status** | Which suppliers are approved, conditional, suspended, overdue | Score trend, days to reassessment, open corrective actions, adverse events |
| **Product admissibility status** | Which products may enter, from where, under what conditions | Determination expiry, permit status, prohibited flags |
| **Expiring permits & certificates** | What lapses in 30/60/90 days | Type, entity, expiry, dependent shipments |
| **Shipment readiness** | Which shipments can be approved, and what is blocking the rest | Per-shipment blocking reason list — the operational heart of the product |
| **Government holds** | What is held, by whom, for how long, and what resolves it | Agency, action, age, resolution path |
| **Corrective actions** | What is open, overdue, and recurring | Age, supplier, recurrence rate |
| **FDA inspection package** | Everything for one FSVP record, assembled | **Already built** |
| **Importer risk profile** | Aggregate exposure across suppliers, commodities, origins | Concentration by supplier/origin, unresolved criticals, refusal history |
| **Supplier performance trends** | Which suppliers are improving or degrading | Score over time, revision rates, on-time evidence, audit outcomes |

Two of these deserve emphasis: **Shipment readiness** is the screen an importer would open every
morning, and **Importer risk profile** is the one that would be shown to an auditor or an
insurer.

---

## 8. Authoritative systems to integrate or reference

| Source | Access | Use | Note |
|---|---|---|---|
| **FDA Data Dashboard API** | REST, **credentialed** | Import refusals, inspection classifications, compliance actions | Free but gated: `Authorization-User` + `Authorization-Key` via OII Unified Logon. FDA's own pages disagree on refusal cadence — the refusals dashboard says weekly, the supplier-evaluation page says monthly. Trust the retrieval date, not either claim |
| **openFDA** | Public REST | Food enforcement and recall history | Free. Key optional (1k/day per IP → 120k/day per key). Weekly. FDA does not update a recall's status after classification |
| **FDA Import Alerts** | Web, no API | Detention-without-physical-examination screening | Manual only. Nothing screens these automatically, and a screening record must say so |
| **FDA FFR / FURLS** | Portal, no API | Facility registration verification | Manual — capture number and status, verify periodically |
| **FDA Prior Notice (PNSI)** | Portal, or via broker ABI | Prior Notice confirmation | No API. Capture the confirmation number |
| **FDA FSVP Importer Portal** | Portal, inspection-gated | Records submission during an inspection | **No API, and only opens after FDA initiates.** Build the package, not an integration |
| **APHIS ACIR / permits** | Web | Commodity admissibility and permit requirements | No usable API; maintain a curated rule table with citations and review cadence |
| **USDA FSIS eligible establishments** | Published lists | Meat/poultry/egg eligibility | Periodic ingest |
| **CBP ACE / ABI** | ABI, CBP-certified filers only | Entry filing | **Do not build.** Partner with a filer |
| **CBP CSMS** | Bulletins | Trade policy and messaging changes | Monitor for rule changes |
| **HTS (USITC)** | Published data | Classification candidates | Advisory only — broker confirms |
| **D&B Direct+** | Commercial API | DUNS validation for § 1.509 identity | Paid, contract-gated |

The pattern to follow: **ingest what has an API, curate what does not, and never present a
curated table as authoritative without a citation and a review date.** A country-commodity rule
table that silently goes stale is worse than no table at all, because it produces confident
wrong answers.

---

## 9. Recommended immediate next step

Phase 1 items 1–3, in that order. They are individually small, they close the three gaps that
most weaken the FSVP claim, and item 3 (regulatory intelligence) is the first thing in this
document that no competitor-adjacent document platform typically does — it turns supplier
scoring from self-reported evidence into evidence plus observed regulatory behaviour.

Everything in Phases 2–4 is larger than everything built to date. That is not an argument
against it; it is an argument for sequencing it deliberately and not starting Phase 3 before
Phase 2's reference layer exists, since shipment gating is meaningless without admissibility
rules to gate against.
