# Cloudflare Pages Deployment

## Build Settings

Build command:

```bash
npm run pages:build
```

Output directory:

```bash
.vercel/output/static
```

Dependency note: `@cloudflare/next-on-pages` is pinned to `1.13.15` so Cloudflare's npm install does not float to `1.13.16`, which requires a newer Next.js peer range than this project currently uses.

## Environment Variables

Set these in Cloudflare Pages:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Only server-side code may read the service role key.

### FDA regulatory intelligence (migration 009)

Optional, and the feature degrades rather than breaks without them:

- `OPENFDA_API_KEY` — openFDA works with no key at 1,000 requests per day per IP.
  A free [api.data.gov key](https://open.fda.gov/apis/authentication/) raises that to
  120,000 per day. Recall ingestion works either way.
- `FDA_DATADASHBOARD_USER` — the email FDA approved, sent as the `Authorization-User` header.
- `FDA_DATADASHBOARD_KEY` — the key FDA issued, sent as `Authorization-Key`.

The Data Dashboard pair gates import refusals, inspection classifications and compliance
actions. Both must be set; `ingestableSources()` in `lib/regulatory/sources.ts` treats one
without the other as absent, because a half-configured credential fails at request time with
a 401 that looks like a supplier having no findings.

None of these are `NEXT_PUBLIC_`. They are read server-side only, inside request handlers —
an FDA credential in a client bundle is a published credential.

## Deployment Workflow

1. Push the repository to GitHub.
2. Create a Cloudflare Pages project from the GitHub repository.
3. Set build command and output directory.
4. Add environment variables for production and preview environments.
5. Deploy.
6. Add the Cloudflare production URL to Supabase Auth redirect URLs.
