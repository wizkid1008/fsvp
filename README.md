# FSVP Compliance Platform

A production-oriented Next.js, TypeScript, Tailwind CSS, Supabase, and Cloudflare Pages starter for managing Foreign Supplier Verification Program support workflows.

The platform supports supplier accounts, protected dashboards, document evidence workflows, readiness assessment, reviewer queues, role-based access, reporting, notifications, Supabase storage, RLS policies, and background regulatory reference documents.

## Stack

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL, Storage, and RLS
- Cloudflare Pages deployment via `@cloudflare/next-on-pages`

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.

## Supabase Setup

1. Create a Supabase project.
2. Apply migrations from `supabase/migrations` in lexical order.
3. Apply optional sample data from `supabase/seed/sample_data.sql`.
4. Confirm storage buckets exist:
   - `supplier-documents`
   - `background-documents`
5. Configure Auth email verification and password recovery URLs:
   - Local: `http://localhost:3000/auth/callback`
   - Production: `https://<your-domain>/auth/callback`
6. Upload FDA/background references to the `background-documents` bucket or keep the checked-in copies under `background-documents/` as repository references.

## GitHub Workflow

```bash
git init
git add .
git commit -m "Initial FSVP Platform"
git remote add origin [GitHub URL]
git push -u origin main
```

## Cloudflare Pages

Build command:

```bash
npm run pages:build
```

Output directory:

```bash
.vercel/output/static
```

Set the same environment variables in Cloudflare Pages project settings. Keep service-role usage server-only.

## Key FSVP Modules

- Supplier profile and approval status
- Product and facility management
- Document repository with versioning support
- Readiness assessment categories and scores
- Reviewer comments, revision requests, and approvals
- Supplier readiness, gap, document status, audit, and executive summary reports
- In-app and email notification data model
- Audit logging for major actions
- Background document library for future requirement mapping

## Future AI Preparation

The schema includes structured document kinds, readiness scores, evidence summaries, reference documents, and audit records so future AI modules can classify documents, extract fields, map evidence to requirements, and suggest gaps. The application intentionally does not provide legal or regulatory advice.

## Production Checklist

- Supabase project created and migrations applied
- RLS policies reviewed against real organization roles
- Auth redirect URLs configured
- Storage upload/download paths verified
- Email templates configured
- Cloudflare Pages environment variables set
- Background documents uploaded to storage
- Domain, TLS, and DNS configured
- Audit log coverage extended for all write operations
- Reviewer and administrator seed accounts created
