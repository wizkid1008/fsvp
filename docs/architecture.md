# Architecture

## Frontend

The frontend uses Next.js App Router with protected routes enforced in `middleware.ts`. Public pages support home, about, contact, login, signup, forgot password, and reset password flows. Protected pages are organized by FSVP workflow module.

## Authentication

Supabase Auth manages email/password login, verification, session refresh, and password recovery. User profile data lives in `profiles`, linked one-to-one with `auth.users`.

## Authorization

Roles:

- `supplier`: manages own profile, supplier records, documents, and readiness status
- `reviewer`: reviews assigned suppliers, comments, requests revisions, and approves documentation
- `administrator`: manages users, suppliers, permissions, workflows, settings, and reference documents

RLS policies combine profile roles with importer tenant membership.

## Database

The schema includes importer tenancy, qualified individuals, supplier and food records, hazard analysis, supplier evaluations, written assurances, verification activities, corrective actions, recalls, FDA inspections, import entries, documents, notifications, reference libraries, readiness assessments, reports, and audit logs.

## Storage

Supabase Storage holds private supplier evidence and background reference documents. Metadata stays in PostgreSQL so review, versioning, approval, and audit history are queryable.

## Reporting

Report records are represented by `generated_reports`. Actual PDF/Excel generation can be implemented with server-side route handlers or a scheduled worker and persisted to private storage.
