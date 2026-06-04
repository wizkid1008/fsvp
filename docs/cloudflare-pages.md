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

## Environment Variables

Set these in Cloudflare Pages:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Only server-side code may read the service role key.

## Deployment Workflow

1. Push the repository to GitHub.
2. Create a Cloudflare Pages project from the GitHub repository.
3. Set build command and output directory.
4. Add environment variables for production and preview environments.
5. Deploy.
6. Add the Cloudflare production URL to Supabase Auth redirect URLs.
