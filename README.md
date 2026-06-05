# ThrushCross Verify

**FSVP Compliance & Supplier Verification Platform**  
by **ThrushCross Trading & Commodities**  
**Verify • Trade • Grow**

ThrushCross Verify is a production-oriented Next.js, TypeScript, Tailwind CSS, Supabase, and Cloudflare Pages platform for risk-based FSVP supplier verification for agricultural commodity imports into the United States.

The core product question is:

> Can this U.S. importer reasonably rely on this foreign supplier for this specific agricultural commodity under the FDA FSVP process?

## Product Focus

ThrushCross Verify is designed as:

- A risk-based supplier verification system
- A commodity-specific FSVP workflow
- A document-to-requirement mapping platform
- An import readiness dashboard
- An audit-ready reporting system

It is not a generic trade website or simple document upload portal.

## Core Modules

- Supplier Intake
- Product & Commodity Risk Assessment
- Facility Profile
- FDA Registration Tracking
- FSVP Gap Assessment
- Document-to-Requirement Mapping
- Reviewer Workflow
- Corrective Action Tracking
- Certification & Expiration Monitoring
- Import Readiness Report
- Admin Dashboard
- Audit Log

## User Roles

- Foreign Supplier
- U.S. Importer
- Reviewer / Consultant
- Administrator

Each role has distinct navigation, dashboard priorities, permissions, and available actions.

## Stack

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL, Storage, and RLS
- Cloudflare Pages deployment via `@cloudflare/next-on-pages`
- GitHub Pages static brand landing page

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
7. Seed first administrator account and assign organization/user role.

## GitHub Workflow

```bash
git init
git add .
git commit -m "Initial ThrushCross Verify platform"
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

## GitHub Pages Landing Page

This repo includes a static ThrushCross Trading & Commodities landing page in `github-pages/` and a workflow at `.github/workflows/github-pages.yml`. It deploys the brand landing page on each push to `main`.

Build locally:

```bash
npm run github-pages:build
```

GitHub Pages is static hosting, so the full Supabase-backed app still belongs on Cloudflare Pages.

## Design and Architecture Docs

- `docs/thrushcross-verify-redesign.md`
- `docs/architecture.md`
- `docs/supabase.md`
- `docs/cloudflare-pages.md`
- `docs/setup.md`

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
- PDF/Excel readiness report generation implemented server-side

## Disclaimer

This platform does not provide legal or regulatory advice. FSVP determinations should be reviewed by qualified regulatory professionals and/or a qualified FSVP Individual.
