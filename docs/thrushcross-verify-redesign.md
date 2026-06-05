# ThrushCross Verify Product Review and Redesign

## Critical Review

The previous surface had the right ingredients but the wrong product posture. It looked like a brand page plus a generic supplier workspace, while the actual user problem is risk-based FSVP determination for a supplier, product, facility, and agricultural commodity.

Weaknesses identified:

- Homepage positioning: too broad; did not say agricultural commodity imports or FSVP supplier verification clearly enough.
- Navigation: organized around generic modules instead of the decision path from supplier intake to commodity risk to requirement evidence to readiness.
- Dashboard structure: showed generic readiness cards rather than risk queue, high-risk commodities, missing evidence, expiring certificates, corrective actions, and ready/not-ready supplier status.
- Supplier onboarding: captured basic identity but did not frame the importer-supplier-product relationship.
- Product onboarding: did not make commodity, origin, processing state, intended use, hazards, and allergen risk central.
- Facility onboarding: did not strongly connect facilities to FDA registration, process controls, capacity, and certifications.
- Document upload: tracked uploads but did not require mapping to a specific FSVP requirement.
- Readiness workflow: had scoring, but not a defensible weighted 100-point model with critical gaps and readiness statuses.
- Reviewer workflow: lacked explicit accept/reject/revision/corrective-action decision support by requirement.
- Admin workflow: needed clearer user-role, organization, requirement-library, and audit-log ownership.
- Reporting: needed an audit-ready import readiness report with supplier/product/facility/risk/requirement mapping.
- Security: Supabase Auth and RLS were present, but the redesigned platform needed organization and role tables.
- Database: the regulatory schema was deep, but it needed a product layer for commodities, requirement evidence, readiness reports, organizations, and role assignment.
- Mobile responsiveness: layouts were responsive, but dashboard density needed clearer risk-first stacking.
- Cloudflare readiness: deployment docs existed; server features still require Cloudflare Pages rather than GitHub Pages static hosting.
- Supabase integration: storage, auth, and RLS existed; new product tables now map platform concepts to tenant security boundaries.

## Redesigned Information Architecture

Public:

- ThrushCross Verify landing page
- Login
- Sign up
- Forgot password
- Reset password

Protected:

- Risk Dashboard
- Supplier Intake
- Product & Commodity Intake
- Commodity Risk Assessment
- Facility Profile
- Document-to-Requirement Mapping
- FSVP Requirement Mapping
- FSVP Gap Assessment
- Corrective Action Tracking
- Reviewer Dashboard
- Import Readiness Reports
- Notifications
- Audit Log
- Account Settings
- Admin Dashboard

## Role Journeys

Foreign Supplier:

- Complete supplier intake
- Add facilities and products
- Upload requested requirement evidence
- Respond to reviewer comments
- Close corrective actions
- View own readiness status

U.S. Importer:

- Start supplier review
- Select commodity/product/facility scope
- Review risk-first dashboard
- Assign reviewer or consultant
- Review final import readiness report
- Approve supplier/product for internal use

Reviewer / Consultant:

- View assigned suppliers
- Review requirement evidence
- Accept, reject, or request revision
- Create corrective actions
- Approve readiness reports
- Maintain audit-ready notes

Administrator:

- Manage organizations and users
- Assign roles
- Configure requirement library
- Monitor storage, RLS, and audit logs
- Maintain workflow settings

## Commodity Risk Engine

The redesigned platform includes commodity workflows for coffee, cocoa, spices, peanuts, tree nuts, grains, oils, fresh produce, dried fruit, and seafood.

The risk module asks commodity type, country of origin, raw/processed state, human food or animal feed, ready-to-eat or further processing use, known hazards, allergen risk, certification status, and recall history.

Outputs include risk level, likely hazard categories, required verification evidence, recommended verification activities, and commodity risk rationale.

## FSVP Requirement Mapping

Evidence is no longer just uploaded. It is mapped to a requirement.

Each requirement tracks requirement name, description, CFR citation, required evidence, uploaded evidence, reviewer status, reviewer notes, gap status, corrective action, and final determination.

Statuses: Not Started, Missing, Uploaded, Under Review, Accepted, Rejected, Revision Required, Complete.

## Readiness Score

The redesigned score is out of 100:

- Supplier Identity: 10
- Product Identity: 10
- Facility Information: 10
- FDA Registration: 10
- Hazard Analysis: 15
- Verification Activities: 15
- Food Safety Controls: 10
- Testing and COAs: 10
- Traceability and Recall: 5
- Corrective Actions: 5

Readiness statuses: Not Ready, Needs Major Revision, Needs Minor Revision, Ready for Importer Review, Approved for Internal Use.

## Database Redesign

Migration `014_thrushcross_verify_redesign.sql` adds `organizations`, `user_roles`, `suppliers`, `commodities`, `products_verify`, `facilities_verify`, `commodity_risks`, `fsvp_requirements`, `requirement_evidence`, `reviews`, and `readiness_reports`.

It also extends `documents` and `readiness_scores`.

## Backend/API Structure

Current API:

- `app/api/documents/upload/route.ts`

Recommended next API routes:

- `/api/commodity-risk/run`
- `/api/requirements/map-evidence`
- `/api/reviews/decision`
- `/api/corrective-actions`
- `/api/readiness-score/recalculate`
- `/api/reports/readiness`
- `/api/audit-log/export`

## Reporting Module

The import readiness report should include supplier profile, product profile, facility profile, commodity risk summary, hazard analysis summary, documents reviewed, FSVP requirement mapping, reviewer comments, open gaps, corrective actions, final readiness status, and the platform disclaimer.

Exports: PDF and Excel.

## Manual Configuration Steps

- Install npm locally and run `npm install`.
- Create Supabase project and apply migrations in order.
- Confirm Supabase Auth email/password, email verification, and password reset settings.
- Configure Auth redirect URLs for local and production.
- Create private Supabase Storage buckets.
- Review RLS policies with real tenant, organization, and user-role data.
- Seed first administrator account and assign organization role.
- Configure Cloudflare Pages environment variables.
- Deploy full app to Cloudflare Pages.
- Use GitHub Pages only for the static brand landing page.

## Disclaimer

This platform does not provide legal or regulatory advice. FSVP determinations should be reviewed by qualified regulatory professionals and/or a qualified FSVP Individual.
