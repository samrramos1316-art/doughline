## What does this change?

<!-- A short description, and the issue it closes if there is one (e.g. "Closes #12"). -->

## How was it tested?

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Relevant `scripts/test-*.mjs` end-to-end script(s) run against my own Supabase project (list them):

## Checklist

- [ ] No real invoices, customer/supplier data, emails or API keys in the diff, fixtures or screenshots
- [ ] New environment variables are in `.env.example` (empty value + comment)
- [ ] Schema changes are a **new** numbered migration; new tenant tables have RLS policies; new views use `security_invoker = true`
- [ ] `types/database.ts` regenerated if the schema changed
- [ ] Screenshots attached for UI changes
