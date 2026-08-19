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

Cloudflare splits these into two scopes, and putting one in the wrong place fails
in a way that is genuinely hard to read. This cost an afternoon on 2026-08-10.

### Build scope — Settings → Variables and secrets

Values Next inlines into the bundle at compile time:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Runtime scope — Settings → Bindings (type: Secret)

Values read by server code **when a request arrives**. A build-scope variable is
NOT visible here — `process.env.X` is simply undefined in the Pages Function:

- `SUPABASE_SERVICE_ROLE_KEY`
- `INGEST_TRIGGER_SECRET`
- `FDA_DATADASHBOARD_USER`
- `FDA_DATADASHBOARD_KEY`
- `OPENFDA_API_KEY`

`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are for local Wrangler use and
belong in `.env.local`, not in the deployed project at all.

Only server-side code may read the service role key.

### How this fails, so it is recognisable next time

`createAdminSupabaseClient()` throws `SUPABASE_SERVICE_ROLE_KEY is not configured`
when the key is missing **or** when its value contains `xxxxx`, which the config
treats as a placeholder.

**This is no longer a single failure mode.** Pages now fall into four groups, and
knowing which is which is the whole diagnostic. An earlier version of this file
said "thirteen pages break together" and named `/suppliers`, `/readiness` and
`/compliance-history` as the check. All three are wrong today: `/suppliers` no
longer exists, and the other two now degrade gracefully — so following that
advice, you would watch them load and conclude the key was set.

| Behaviour without the key | Pages |
| --- | --- |
| **Crashes with an opaque digest** | `/fsvp-records/[id]` |
| **Shows the real error message** | `/reviewer`, `/corporate` (construction is inside a `try`) |
| **Renders a ConfigurationNotice** | every page using `tryAdminClient()` — `/exporters`, `/importers`, `/readiness`, `/compliance-history`, `/applicability`, `/qualified-individuals`, `/importer-review`, `/setup/fsvp`, `/shipment-readiness`, `/admin/reference-rules` |
| **Looks completely fine** | `/facilities`, `/products`, `/my-suppliers` — they only construct the client when the account has linked suppliers, so an empty account never touches it |

**The best check is `/reviewer`.** It constructs the client unconditionally inside
a `try` and prints the actual exception on the page, so it tells you the answer
rather than making you infer it. `/fsvp-records/[id]` is the one that still fails
opaquely.

Three things that look like evidence and are not:

- **`/dashboard` loading proves nothing.** It only constructs the admin client
  when an administrator is previewing a supplier account. `/account` proves
  nothing either — it never uses it.
- **A page rendering proves nothing on its own.** Most now catch the throw and
  show a notice, which is easy to scroll past on a screen you expected to be
  empty anyway.
- **A stable digest across deploys does not mean the deploy is stale.** Next
  hashes the error message, so an unchanged message yields an unchanged digest
  no matter how many times you rebuild.

Keep this table honest when you add a page: `grep -rl createAdminSupabaseClient app --include=page.tsx`
lists the candidates, and whether each is guarded by `tryAdminClient()`, wrapped
in a `try`, or conditional on there being data decides which row it belongs in.

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

- `FDA_PCB_USER` — the email FDA approved, sent as `Authorization-User`.
- `FDA_PCB_KEY` — the key FDA issued, sent as `Authorization-Key`.

The Product Code Builder pair gates `lib/regulatory/product-code-builder.ts`, which reads
FDA's product-code reference tables and verifies codes an importer already holds. Both must
be set, for the same reason as the pair above.

These are a **separate** credential from the Data Dashboard pair even though both are issued
through the same OII Unified Logon. FDA issues keys per application, so do not assume one
value works for both — request PCB access explicitly and set these two variables even if the
values turn out to match.

None of these are `NEXT_PUBLIC_`. They are read server-side only, inside request handlers —
an FDA credential in a client bundle is a published credential.

### Scheduled compliance maintenance

Cloudflare Pages does not provide cron triggers for this app. The repository
uses `.github/workflows/scheduled-compliance.yml` to call
`/api/cron/compliance` once per FDA source each day.

Configure both places with the same secret:

- Cloudflare Pages runtime Binding: `INGEST_TRIGGER_SECRET`
- GitHub repository secret: `INGEST_TRIGGER_SECRET`

Also add `FSVP_BASE_URL` as a GitHub repository secret, for example
`https://fsvp.pages.dev`.

When `INGEST_TRIGGER_SECRET` is unset in Cloudflare, `/api/cron/compliance`
returns 404 and does no work. That keeps the machine-triggered path disabled
until deployment is deliberately configured.

## Deployment Workflow

1. Push the repository to GitHub.
2. Create a Cloudflare Pages project from the GitHub repository.
3. Set build command and output directory.
4. Add environment variables for production and preview environments.
5. Deploy.
6. Add the Cloudflare production URL to Supabase Auth redirect URLs.
