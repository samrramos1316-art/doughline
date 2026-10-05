# Contributing to DoughTally

Thanks for helping. DoughTally is built for owners of very small food businesses, so we value simple, reliable and fast over clever.

## Ground rules

- Be kind. Everyone here is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).
- Security problems go through [SECURITY.md](SECURITY.md), never a public issue.
- **Never commit real data.** That covers real invoices, customer or supplier details, emails and API keys. Use the made-up businesses in `scripts/fixtures/` or invent your own (`example.com` emails, `555` phone numbers).

## Getting set up

Follow the Quickstart in the [README](README.md) and, for a full environment, [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

> **Next.js note:** this project runs Next.js 16, which renamed `middleware.ts` to `proxy.ts` and changed other APIs. Before relying on older Next.js knowledge, check the guides in `node_modules/next/dist/docs/` (see `AGENTS.md`).

## Making a change

1. For anything bigger than a small fix, open an issue first so we can agree on the approach.
2. Fork the repo and create a branch from `main`.
3. Keep the change focused: one fix or feature per pull request.
4. Run the checks:
   ```bash
   npm run lint
   npm run typecheck
   npm run build
   ```
5. If you touched a flow covered by a `scripts/test-*.mjs` end-to-end script, run it against your own Supabase project and say so in the PR.
6. Open a pull request and fill in the template.

## Database changes

- Add a **new** numbered migration (`supabase/migrations/026_short_name.sql`). Never edit a migration that has already shipped.
- Every new tenant table needs an `org_id`, `enable row level security`, and select/insert/update/delete policies scoped to `current_org_id()`. Extend `scripts/test-rls-isolation.mjs` to cover it.
- Views must be created `with (security_invoker = true)` (see migration 021), or they bypass RLS.
- Regenerate `types/database.ts` after a schema change:
  `npx supabase gen types typescript --project-id <your-project-ref> > types/database.ts`

## Secrets and the service-role key

- Only `lib/supabase/admin.ts` may use `SUPABASE_SECRET_KEY`, and it imports `server-only`. Don't import it from client components or general request paths; user requests should go through the RLS-respecting client in `lib/supabase/server.ts`.
- Only `NEXT_PUBLIC_*` variables reach the browser. Never put a secret behind that prefix.
- Add every new environment variable to `.env.example` with an empty value and a comment.

## Code style

- TypeScript throughout; validate request bodies with Zod (`lib/validators/`).
- Match the surrounding code: short comments that explain *why*, not *what*.
- AI calls live only in `lib/ai/`, `lib/suggestions/narrative.ts` and `lib/onboarding/`. Keep it that way so swapping providers stays contained.

## License

By contributing, you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).
