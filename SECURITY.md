# Security Policy

DoughTally stores businesses' supplier prices, recipes and invoice files, so we take security reports seriously.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a security problem.**

Report it privately in either of these ways:

1. **GitHub private vulnerability reporting** (preferred): open the repository's **Security** tab and click **Report a vulnerability**.
2. **Email:** support@doughtally.app, with "SECURITY" in the subject line.

Please include:

- what the issue is and what an attacker could do with it
- steps to reproduce, or a proof of concept
- the commit or version you tested against, and whether it affects the hosted service, self-hosted installs, or both

## What to expect

- An acknowledgement within **3 business days**.
- An assessment and, where it applies, a fix timeline within **14 days**.
- Credit in the release notes once a fix ships, unless you'd rather stay anonymous.

Please give us a reasonable chance to fix the issue before disclosing it publicly.

## Scope

In scope:

- Tenant isolation: one business reading or changing another's data (Row-Level Security, views, RPC functions, storage policies)
- Authentication, session handling, and the access gate
- Leaks of server-only secrets (`SUPABASE_SECRET_KEY`, AI provider keys, `CRON_SECRET`) to the browser
- Injection, SSRF, or file-upload issues in the API routes

Out of scope:

- Problems that require a self-hoster to misconfigure their own deployment (for example, publishing their secret key)
- Denial of service through volume, and rate-limit tuning
- Findings from automated scanners with no demonstrated impact

## Supported versions

Only the latest commit on `main` is supported. Self-hosters should keep up with `main` and re-apply new migrations in order.
