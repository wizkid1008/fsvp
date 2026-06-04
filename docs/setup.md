# Setup Documentation

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment

Create `.env.local` from `.env.example` and fill in Supabase and Cloudflare values.

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe for frontend use. `SUPABASE_SERVICE_ROLE_KEY` is reserved for server-only administrative jobs and must not be imported into client components.

## 3. Run Supabase Migrations

Apply all SQL files in `supabase/migrations` in sorted order. The first 12 migrations model importer tenancy, qualified individuals, supplier/food records, hazard analysis, verification, recalls, documents, reminders, portal/API operations, and reference templates. Migration `013_app_auth_storage_readiness.sql` adds Supabase Auth profiles, app-facing tables, storage buckets, and RLS policies.

Optional sample data:

```bash
supabase db reset
psql "$DATABASE_URL" -f supabase/seed/sample_data.sql
```

## 4. Run Locally

```bash
npm run dev
```

## 5. Validate

```bash
npm run typecheck
npm run lint
npm run build
```

## 6. Deploy

Cloudflare Pages build command:

```bash
npm run pages:build
```

Output directory:

```bash
.vercel/output/static
```

## 7. Initial GitHub Pages Preview

The repository also includes a static GitHub Pages preview under `github-pages/`.
This is intentionally separate from the full Supabase-backed app because GitHub
Pages cannot run Next.js middleware, protected server routes, or upload APIs.

Build locally:

```bash
npm run github-pages:build
```

The GitHub Actions workflow in `.github/workflows/github-pages.yml` deploys the
static preview on every push to `main`.
