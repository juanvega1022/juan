# Napkin

A marketplace for ideas. Each idea has a free one-line teaser and a sealed full write-up. Buyers pay to unlock it; creators keep 85%, the platform keeps 15%.

> "Napkin" is a working name. Check trademarks and domains before launch.

**Stack:** Next.js 16 (App Router, TypeScript) · Supabase (Postgres, auth, RLS) · Stripe Connect Express + Checkout · Tailwind v4 · Vercel.

## The security rule

`ideas.body` never reaches a browser unless the viewer is the author or has a **paid** purchase. Three layers enforce this:

1. **Column privileges.** `anon` and `authenticated` have no `SELECT` on `ideas.body`. Even `select=*` through the Supabase API is refused (`supabase/migrations/…_init.sql`).
2. **One way in.** `get_idea_body(idea_id)` is a `SECURITY DEFINER` function that returns the body only for the author, or for a buyer whose purchase has `status = 'paid'` (and only if the idea hasn't been removed).
3. **Only the webhook marks a purchase paid.** Clients can't write `purchases`. The Checkout success redirect only shows a "confirming…" notice. `checkout.session.completed` (signature-verified, amount-checked) is what flips the purchase to `paid`.

Other rules the database enforces:

- An idea can't go live until the author has `payouts_enabled`.
- Only admins can remove an idea.
- Once an idea has a buyer, its body and price are frozen.
- Ratings need a paid purchase.
- Users can't change their own `is_admin`, `stripe_account_id` or `payouts_enabled`.
- Stats (`unlock_count`, `rating_*`) are kept up to date by triggers.

## Layout

```
src/
  app/
    page.tsx                  feed: category filter, sort (new / top rated / most unlocked)
    idea/[id]/                teaser, price, ratings; body once unlocked; checkout, rate, report, refund
    post/                     create / edit idea (draft → live)
    me/                       my ideas, earnings, unlocks, Stripe status, profile
    u/[username]/             public creator profile
    admin/                    reports and refund requests
    login/, auth/             magic link + Google, PKCE callback, sign-out
    terms/                    draft terms of service
    api/stripe/connect        start/resume Connect Express onboarding
    api/stripe/connect/return refresh payout status after onboarding
    api/stripe/dashboard      Express dashboard login link
    api/stripe/webhook        checkout + refund + account.updated events
  lib/                        supabase clients, stripe, auth helpers, types
  proxy.ts                    refreshes the Supabase session cookie (Next 16's "middleware")
supabase/
  migrations/                 schema, RLS, grants, triggers
  tests/                      RLS tests that run on plain Postgres
e2e/walkthrough.mjs           browser walkthrough against a local stack
```

## Running locally

```bash
npm install
cp .env.example .env.local
npx supabase start         # needs Docker; prints the API URL and keys
npm run dev
```

Put the printed `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` into `.env.local`. Magic-link emails show up in Mailpit at http://127.0.0.1:54324.

Stripe test mode:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,charge.refunded,account.updated \
  --forward-connect-to localhost:3000/api/stripe/webhook
```

Put the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`. Locally, the same secret works for Connect events.

To make yourself an admin:

```sql
update profiles set is_admin = true where username = 'you';
```

## Checks

```bash
npm run lint
npm run typecheck
npm run build
PGHOST=... PGUSER=postgres npm run test:db   # RLS tests on a throwaway Postgres DB
CHROMIUM_PATH=... npm run test:e2e           # needs supabase start + npm run dev
```

The E2E walkthrough covers these steps:

1. Sign in with a magic link.
2. Save a draft. Publishing is blocked until payouts are set up.
3. Publish the idea.
4. As a non-buyer, check the body isn't anywhere in the HTML or RSC payload.
5. Open the success redirect with no webhook yet; it doesn't unlock.
6. Send a forged webhook; it's rejected.
7. Send a signed webhook; the idea unlocks.
8. Rate the idea 1 star and request a refund.
9. Report the idea.
10. Check earnings show 85%.
11. As an admin, deny the refund and remove the idea.
12. Refund via webhook; the buyer loses access.
13. Check the mobile layout.

## Deploying

1. **Supabase project.**
   - Run `npx supabase link` and `npx supabase db push`.
   - Under Auth → URL configuration, set the site URL and add `https://YOUR-DOMAIN/auth/callback` as a redirect URL.
   - Enable the Google provider with your Google OAuth client.
2. **Stripe.**
   - Enable Connect.
   - Add a webhook endpoint `https://YOUR-DOMAIN/api/stripe/webhook` for your account's events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`.
   - Add a second endpoint for **connected accounts** with `account.updated`.
   - Put the two signing secrets in `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET`.
3. **Vercel.** Import the repo and set every variable in `.env.example`, with `NEXT_PUBLIC_SITE_URL` set to the production URL.

## How payments work

- **Creator onboarding.** `/api/stripe/connect` creates an Express-style connected account and sends the creator to Stripe-hosted onboarding:
  - Stripe collects the creator's details and runs the dashboard.
  - The platform pays the Stripe fees and carries the losses.
  - It requests the `transfers` capability.
  
  `payouts_enabled` mirrors `capabilities.transfers === 'active'`. It's synced when the creator returns from onboarding and on every `account.updated`.
- **Checkout.**
  - The server creates or reuses the single `(idea, buyer)` purchase row as `pending`, and expires any earlier open session.
  - It then creates a Checkout Session with `transfer_data.destination` set to the creator and `application_fee_amount = round(15% × price)`.
- **Webhook.** It verifies the signature, checks `amount_total`, and marks the purchase `paid`. If the same buyer somehow pays twice, the second payment is refunded automatically.
- **Refunds (v1).**
  - Within 24 hours of paying, a buyer who rated the idea 1 star can request a refund.
  - An admin approves or denies it in `/admin`.
  - Approval refunds the full amount, reversing both the transfer and the platform fee.
  - The purchase becomes `refunded`, and access is revoked. A `charge.refunded` from the Stripe dashboard does the same.

## Notes for later migrations

Supabase grants `anon`/`authenticated` full privileges on new tables by default. When adding tables or columns, grant columns explicitly, as the init migration does. In particular, **never `grant select on public.ideas`** without a column list.

## Before launch

- [ ] Lawyer review of `/terms`. The draft covers:
  - ideas are sold as information, not IP or exclusive rights;
  - creators confirm the idea is theirs and not confidential to an employer;
  - content rules and removal.
- [ ] Name / trademark / domain check.
- [ ] Production Stripe Connect settings: branding, payout schedule, supported countries.
- [ ] Rate limiting on login and report endpoints. Supabase rate-limits auth emails by default.
- [ ] Generate typed Supabase client types: `npx supabase gen types typescript`.
