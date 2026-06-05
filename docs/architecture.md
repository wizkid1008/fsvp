# ThrushCross Verify Architecture

## Frontend

The frontend uses Next.js App Router with protected routes enforced in `middleware.ts`. Public pages support the ThrushCross Verify landing experience, login, signup, forgot password, and reset password flows.

Protected pages are organized around the FSVP decision path:

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

## Authentication

Supabase Auth manages email/password login, email verification, session refresh, and password recovery. User profile data lives in `profiles`, linked one-to-one with `auth.users`.

## Authorization

Roles:

- `foreign_supplier`: manages own supplier intake, facilities, products, evidence uploads, revision responses, and corrective action evidence
- `us_importer`: reviews supplier/product readiness, assigns reviewers, and approves internal-use readiness reports
- `reviewer`: reviews evidence, accepts/rejects documents, requests revisions, creates corrective actions, and approves reports
- `administrator`: manages organizations, users, roles, requirement libraries, workflow configuration, and audit logs

RLS policies combine profile identity, organization role, and importer tenant membership.

## Database

The schema includes importer tenancy, organizations, user roles, suppliers, commodities, products, facilities, commodity risk records, FSVP requirements, requirement evidence, hazard analysis, supplier evaluations, written assurances, verification activities, corrective actions, recalls, FDA inspections, import entries, documents, notifications, reference libraries, readiness assessments, readiness reports, and audit logs.

## Storage

Supabase Storage holds private supplier evidence and background reference documents. Metadata stays in PostgreSQL so review, versioning, approval, requirement mapping, expiration monitoring, and audit history are queryable.

## Reporting

Report records are represented by `readiness_reports` and `generated_reports`. Actual PDF/Excel generation can be implemented with server-side route handlers or a scheduled worker and persisted to private storage.

## Deployment

The full application targets Cloudflare Pages because it includes protected routes, Supabase session handling, and server-side upload/report APIs. GitHub Pages is used only for the static ThrushCross brand landing page.
