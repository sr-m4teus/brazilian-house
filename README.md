# Brazilian House — CWL Stats

A site that captures Clash of Clans Clan War League (CWL) per-player attack/defense/Town-Hall stats for the Brazilian House clans (slots 1–3) into Supabase, and shows per-clan/season dashboards and per-player career pages.

**Tech stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Auth) · Vercel (hosting + Cron) · RoyaleAPI proxy (stable IP for the CoC API)

---

## Local Development

```bash
npm install
cp .env.example .env.local   # then fill in values (see below)
npm run dev                  # http://localhost:3000
npm run test                 # Vitest unit tests
npm run build                # production build check
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in each value:

| Variable | Description |
|---|---|
| `COC_API_TOKEN` | Clash of Clans API token. The token's allowed IP **must** be `45.79.218.79` (the RoyaleAPI proxy IP), because Vercel uses dynamic IPs. Create the token at [developer.clashofclans.com](https://developer.clashofclans.com). |
| `COC_API_BASE` | Base URL for the CoC API. Defaults to `https://proxy.royaleapi.dev/v1` (the RoyaleAPI proxy). |
| `CLAN_1_TAG` | Tag for Brazilian House clan slot 1. Note: CoC tags use the digit `0`, never the letter `O`. |
| `CLAN_2_TAG` | Tag for Brazilian House clan slot 2. |
| `CLAN_3_TAG` | Tag for Brazilian House clan slot 3. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (used in the browser for public reads). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public reads; safe to expose). |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only writes). **Never expose this to the browser.** |
| `CRON_SECRET` | Shared secret that guards `/api/cron`. Set the same value in Vercel project settings so the Vercel cron scheduler is authorized to call the route. |

---

## Database Setup

Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor (or via `supabase db push`).

This migration creates the tables, RLS read policies, and seeds the 3 Brazilian House clans.

---

## Admin User

Create one user (email + password) in the Supabase Auth dashboard. There is no public signup.

Log in at `/admin/login` to access the `/admin` page, which exposes a force-refresh button and capture run status.

---

## Deploy to Vercel

1. Import the GitHub repository in the [Vercel dashboard](https://vercel.com/new).
2. Add all environment variables listed above in **Project Settings → Environment Variables**.
3. Deploy.

The cron defined in `vercel.json` runs `/api/cron` daily at **09:00 UTC on days 1–12 of each month** (the CWL window). Vercel automatically sends `Authorization: Bearer $CRON_SECRET` to the route.

You can also trigger a capture manually:
- From the **Vercel dashboard → Cron** tab.
- From the **`/admin`** page using the force-refresh button.

---

## How Capture Works

During CWL, the daily cron fetches each clan's league group and wars via the RoyaleAPI proxy, aggregates per-player attack/defense/Town-Hall stats, and upserts a season snapshot into Supabase (idempotent — safe to re-run). The league group only exists while CWL is active, which is why the capture runs daily during the window rather than once.
