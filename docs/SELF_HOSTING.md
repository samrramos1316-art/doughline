# Self-hosting DoughTally

This guide takes you from an empty Supabase account to a running DoughTally on Vercel, with the daily market-data job. Allow about 30 minutes.

**You'll need:**

- Node.js 20 or newer, and Git
- A [Supabase](https://supabase.com) account (the free tier is fine to start)
- A [Vercel](https://vercel.com) account (or any host that runs Next.js 16; this guide uses Vercel)
- An [Anthropic API key](https://console.anthropic.com) (reads invoices, menus and recipes)
- A [Voyage AI API key](https://dash.voyageai.com) (ingredient matching)
- Optional: a free [USDA MyMarketNews API key](https://mymarketnews.ams.usda.gov/mymarketnews-api) for Market Watch

---

## 1. Get the code

```bash
git clone https://github.com/samrramos1316-art/doughline.git doughtally
cd doughtally
npm install
cp .env.example .env.local
```

`.env.local` is git-ignored. Never commit it.

## 2. Create the Supabase project

1. In the Supabase dashboard, click **New project**. Pick a region close to your users, and note it, because you'll match your Vercel region to it in step 6.
2. Open **Project Settings → API** and copy these into `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable key** (called `anon` in older projects) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Secret key** (called `service_role` in older projects) → `SUPABASE_SECRET_KEY`

> The **secret key bypasses Row-Level Security** and can read every business's data. It is only ever used server-side: by the market-data cron job, the owner console, and the `scripts/` test tooling. Never put it in a `NEXT_PUBLIC_` variable, never commit it, and rotate it right away if it leaks.

## 3. Run the migrations, in order

The schema lives in `supabase/migrations/`, numbered `001` to `024`. **They must be applied in numeric order**, because later migrations alter tables, views and functions created by earlier ones.

**Option A: Supabase CLI (recommended)**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>   # the ref is in your project URL
npx supabase db push                                  # applies 001 → 024 in order
```

**Option B: SQL editor.** Open **SQL Editor** in the dashboard and run each file's contents in turn, `001_extensions.sql` first and `024_unique_ingredient_names.sql` last. Don't skip any.

The migrations set up everything DoughTally needs:

- the `vector` (pgvector), `uuid-ossp` and `pg_trgm` extensions (001)
- every table, with **Row-Level Security enabled and org-scoped policies** on all tenant tables (002–011)
- a trigger that creates each new user's organization and profile on signup (012)
- the costing views, recreated with `security_invoker = true` so they respect RLS (021)

**Check it worked:** in **Table Editor**, every table should show "RLS enabled". To test tenant isolation, run `node scripts/test-rls-isolation.mjs` (it uses `.env.local` and creates and deletes two test users).

## 4. Storage bucket

Migration `013_invoice_storage.sql` creates a **private** bucket called `invoices`, along with policies that only let a user reach files under their own organization's folder (`{org_id}/…`). There's nothing to click. Just confirm it under **Storage**:

- the bucket `invoices` exists
- it is **not** marked Public

Don't make this bucket public. Invoice photos contain supplier pricing and business details.

## 5. Auth settings

In **Authentication → URL Configuration**:

- **Site URL:** your app's URL (`http://localhost:3000` for local dev, then your production domain)
- **Redirect URLs:** add `http://localhost:3000/auth/confirm` and `https://<your-domain>/auth/confirm`

Signup sends a confirmation email that lands on `/auth/confirm`. Supabase's built-in email sender is heavily rate-limited, so for real use configure your own SMTP under **Authentication → Emails → SMTP settings**.

## 6. Environment variables

Every variable is listed, with a comment, in [`.env.example`](../.env.example). Summary:

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable/anon key; browser-safe |
| `SUPABASE_SECRET_KEY` | yes | Service-role key; **server-only** |
| `VISION_PROVIDER` | yes | `claude` (see below) |
| `CLAUDE_API_KEY` | yes | Anthropic key. If empty, the SDK falls back to `ANTHROPIC_API_KEY` |
| `VOYAGE_API_KEY` | yes | Embeddings for ingredient matching |
| `CRON_SECRET` | for Market Watch | Long random string; protects the cron route |
| `USDA_API_KEY` | optional | Without it, only the FAO series are ingested |
| `DOUGHTALLY_ACCESS` | optional | `closed` = only allow-listed emails can sign up or log in |
| `DOUGHTALLY_ALLOWED_EMAILS` | optional | Comma-separated allow-list used when access is closed |
| `DOUGHTALLY_ADMIN_EMAILS` | optional | Comma-separated emails that can open `/admin` |
| `VISION_DEBUG_RAW` | optional | `1` logs raw model output; leave empty in production |

Generate a `CRON_SECRET` with `openssl rand -hex 32`.

### The `VISION_PROVIDER` switch: `gemini` | `claude`

Invoice, menu and recipe photos are read through a provider interface (`lib/ai/vision/`), selected by `VISION_PROVIDER`:

- **`claude`**: the working implementation (Claude structured outputs). **Use this.**
- **`gemini`**: **a stub today.** It returns no lines, so every scan falls through to manual entry. It's there so a real Gemini implementation can slot in without touching the rest of the pipeline. Contributions are welcome.

> ⚠️ If `VISION_PROVIDER` is **unset**, the code defaults to `gemini`, and scans quietly extract nothing. Always set `VISION_PROVIDER=claude`. If it's set to an **empty string**, scans fail with "Unknown VISION_PROVIDER".

## 7. Run locally

```bash
npm run dev
```

Open http://localhost:3000, sign up, confirm your email, and you'll land on the dashboard.

Optional: `node scripts/seed-demo-data.mjs` creates a demo account (`demo@doughline.test`) with sample ingredients, recipes and price history.

## 8. Deploy to Vercel

1. Push your fork to GitHub and click **Add New → Project** in Vercel to import it. The framework (Next.js) is detected automatically.
2. Under **Settings → Environment Variables**, add every variable from step 6 for the **Production** environment (and Preview if you use it).
3. **Region:** `vercel.json` pins functions to `cle1` (Cleveland, next to Supabase's `us-east-2`). Change `"regions"` to the Vercel region nearest your Supabase project, or delete the line.
4. Deploy, then add your production domain to Supabase's Site URL and Redirect URLs (step 5).

## 9. The market-data cron job

Market Watch shows daily USDA wholesale prices (eggs, butter, wheat) and the monthly FAO Food Price Index. They're fetched by `GET /api/cron/ingest-market-data`, which `vercel.json` schedules **daily at 17:00 UTC**:

```json
"crons": [{ "path": "/api/cron/ingest-market-data", "schedule": "0 17 * * *" }]
```

- Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically once `CRON_SECRET` is set in the project's environment. The route rejects anything else with `401`.
- Each run upserts the last 400 days, so it's idempotent and catches up on missed days. USDA and FAO fail independently of each other.
- Writing to `commodity_price_series` uses the secret key, because this shared, non-tenant table has no user insert policy.

To fill the data right after deploying, trigger it once by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/ingest-market-data
```

**Not on Vercel?** Point any scheduler (GitHub Actions, cron, Supabase scheduled functions) at the same URL with the same header once a day.

## 10. Keeping up to date

```bash
git pull
npm install
npx supabase db push      # applies any new migrations, in order
```

Then redeploy. New migrations are always added as new numbered files; existing ones are never edited.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every scan ends up with zero lines / goes to manual entry | `VISION_PROVIDER` unset or `gemini`; set it to `claude` |
| "Unknown VISION_PROVIDER" | `VISION_PROVIDER` is set to an empty string |
| Lines never auto-match | `VOYAGE_API_KEY` missing, or ingredients created before the key was set: run `node scripts/backfill-ingredient-embeddings.mjs` |
| Confirmation email link lands on the home page | `/auth/confirm` is missing from Supabase's Redirect URLs |
| Market Watch is empty | Cron not run yet (trigger it manually), `CRON_SECRET` mismatch, or no `USDA_API_KEY` (FAO only) |
| "DoughTally isn't open yet" on login | `DOUGHTALLY_ACCESS=closed` and your email isn't in `DOUGHTALLY_ALLOWED_EMAILS` |
