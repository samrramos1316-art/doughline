# DoughTally

**Snap a photo of a supplier invoice. Know what every menu item really costs you.**

DoughTally is a back office for small food businesses: home bakeries, food trucks, cafés and small caterers. Take a phone photo of a supplier invoice (or drop in an emailed PDF) and DoughTally reads every line. It matches each line to your ingredients and updates their costs. It recalculates the cost and margin of every recipe and menu item that uses them. When a price jumps, it tells you exactly which menu items got less profitable, and by how much.

> **Self-host it for free**, or use the hosted version at **<HOSTED_URL_PLACEHOLDER>**.

<!-- Screenshots: add images to docs/screenshots/ and reference them here. -->
| Dashboard | Swipe to verify | Margins |
|---|---|---|
| _screenshot coming soon_ | _screenshot coming soon_ | _screenshot coming soon_ |

## Features

- **Invoice photo → ingredient costs.** An AI vision model reads phone photos and PDFs (multi-page included) into structured line items. Pack sizes such as "36/1#" are understood, so a per-case price becomes a per-pound cost.
- **Smart ingredient matching.** Each line is matched to your ingredient list with vector embeddings. Once you've confirmed what a supplier's wording means, it's remembered, so the next invoice from that supplier matches automatically.
- **Swipe to verify.** Uncertain matches show up as cards: swipe right to confirm, left to reject. Gloves, fuel surcharges and other non-ingredients can be marked once and are skipped from then on.
- **Recipe costs and menu margins, always current.** Cost per serving and margin are computed live from the latest confirmed prices. Nothing goes stale.
- **Price-increase alerts.** When a confirmed price moves past your threshold, DoughTally shows every affected menu item with its margin before and after the change.
- **Suggestions.** Get the price that restores your target margin and the portion change that would do the same, plus an optional AI-written explanation of the trade-off.
- **Market Watch.** Daily USDA wholesale prices (eggs, butter, wheat) and the UN FAO Food Price Index, shown as direction only, never as a forecast.
- **Never locked in.** Every screen has manual entry: a spreadsheet-style grid, CSV import/export of your ingredient list, and a typed fallback for invoices the AI can't read.
- **Fast onboarding.** Upload photos or PDFs of your menu and recipes and review a pre-filled draft instead of typing everything.
- **Installable PWA** for phones, with camera capture.
- **Multi-tenant and secure by default.** Every business's data is isolated with Postgres Row-Level Security, and invoice files are kept in a private storage bucket.

## Tech stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript |
| Styling | Tailwind CSS 4, GSAP + Lenis on the landing page |
| Database / Auth / Storage | Supabase (Postgres + pgvector, Auth, Storage, RLS) |
| Invoice/menu/recipe reading | Claude (structured outputs) behind a `VisionProvider` interface; Gemini provider stubbed |
| Embeddings | Voyage AI `voyage-3.5` |
| Validation | Zod |
| Market data | USDA AMS MyMarketNews, FAO Food Price Index |
| Hosting | Vercel (app + daily cron) |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

## Quickstart

You need Node.js 20+ and a Supabase project, either on [supabase.com](https://supabase.com) or local via the Supabase CLI.

```bash
git clone https://github.com/samrramos1316-art/doughline.git doughtally
cd doughtally
npm install
cp .env.example .env.local   # then fill in the values
```

1. Apply the SQL migrations in `supabase/migrations/` **in numeric order** (001 → 025).
2. Fill in `.env.local`. At minimum you need the three Supabase values, `CLAUDE_API_KEY` and `VOYAGE_API_KEY`.
3. Run the app:

```bash
npm run dev
# open http://localhost:3000 and sign up
```

The full walkthrough, covering storage, auth redirect URLs, Vercel and the cron job, is in **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

### Checks

```bash
npm run lint
npm run typecheck
npm run build
```

`scripts/test-*.mjs` are end-to-end scripts that run against a real Supabase project, a running dev server and, for some, real AI API keys. Read the header comment of each before running it. They create and delete their own test users.

## Hosted vs. self-hosted

DoughTally is free and open source under the AGPL. You can run it yourself at no cost beyond your own Supabase, Vercel and AI API usage. If you'd rather not manage any of that, use the hosted version at **<HOSTED_URL_PLACEHOLDER>**.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue, follow [SECURITY.md](SECURITY.md); please don't open a public issue.

## License

[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`). If you run a modified version of DoughTally as a network service, the AGPL requires you to offer your users the source code of your modified version.
