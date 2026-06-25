# Brazilian House — CWL Stats Site (Design)

**Date:** 2026-06-25
**Status:** Approved (design), pending spec review

## Purpose

Public website displaying Clash of Clans Clan War League (CWL) performance for the
Brazilian House clan family (clans 1–3, future 4). Each CWL season, per-player
attack and defense stats — plus each player's Town Hall (CV) level — are captured
automatically from the official Clash of Clans API and stored as a snapshot. The
site shows a per-clan/per-season dashboard and a per-player career page.

## Scope (v1)

In scope:
- Automatic daily capture of CWL data during the league period (days ~1–12).
- Per-clan, per-season **dashboard** (summary cards + player table).
- Per-player **career** page aggregating all their seasons/clans.
- Stats tracked: **attack** (attacks used/available, stars, destruction %,
  3★/2★/1★/0★/missed) and **defense** (defenses, defensive stars given up,
  defensive destruction), plus **Town Hall level**.
- Admin login + manual "force refresh" backup button + last-run status.

Out of scope (future):
- Attack-by-attack detail view (PDF pages 4–5). Only the per-player aggregate
  (PDF page 1) is stored in v1. The data model can be extended later.
- Clan 4 (structure supports it via `slot`, not yet populated).
- Cross-season clan history view.

## Clans

| Slot | Name | Tag |
|---|---|---|
| 1 | (clan 1) | `#90YVJJC8` |
| 2 | BrazilianHouse2 | `#2JG0ULJQG` |
| 3 | (clan 3) | `#2CPVJ088C` |

> Tag note: CoC tags use only the charset `0,2,8,9,P,Y,L,Q,G,R,J,C,U,V` (no letter
> "O"). Slots 2 and 3 were given with an "O" that must be the digit "0"; the tags
> above use "0". **Verify all three tags against the API on first fetch.**

## Architecture

```
Vercel Cron (daily, days 1-12)
        │
        ▼
 app/api/cron  ──►  lib/coc/client (proxy.royaleapi.dev)  ──►  CoC API
        │                                  │
        │                                  ▼
        │                         lib/coc/mapper (pure)
        │                                  │
        ▼                                  ▼
 lib/db (Supabase upsert) ◄────────────────┘

 Public pages ──► lib/db (read only)   (never call CoC API directly)
 Admin pages  ──► auth + force-refresh + status
```

### Tech stack
- **Next.js (App Router) + TypeScript**, deployed to **Vercel**.
- **Supabase** — Postgres + Auth (admin login).
- **Tailwind CSS** — dark "Clash" theme, dashboard layout (option B).
- **Vercel Cron** — daily job during CWL.
- **RoyaleAPI proxy** (`proxy.royaleapi.dev`) — fixed-IP egress for the CoC API
  token (Vercel has dynamic IPs; CoC tokens are IP-locked).

### Modules

| Module | Responsibility | Depends on |
|---|---|---|
| `lib/coc/client.ts` | Call CoC API via proxy: `leaguegroup`, `war`. Inject token, base URL. | `fetch`, env token |
| `lib/coc/mapper.ts` | Pure transform: raw war JSON → per-player season stats. No I/O. | none |
| `lib/db/snapshots.ts` | Upsert `season_clans` + `player_season_stats` + `players`/`clans`. | Supabase |
| `lib/db/reads.ts` | Read dashboard (clan+season) and career (player). | Supabase |
| `app/api/cron/route.ts` | Daily job: for each clan → client → mapper → db upsert. Skip if no active league. | above |
| `app/(public)/...` | Dashboard page, career page. Read-only from db. | `lib/db/reads` |
| `app/admin/...` | Login, force-refresh action, last-run status. | auth, db |

Each unit has one purpose, communicates through typed interfaces, and is testable
in isolation. `mapper.ts` is pure so it can be tested against fixtures.

## Data Model (Postgres / Supabase)

Player identity = **tag** (stable). Name and CV level change over time and are
captured per snapshot.

```
clans               (id, tag UNIQUE, name, slot)
seasons             (id, key UNIQUE e.g. "2026-06", label)
season_clans        (id, season_id→seasons, clan_id→clans,
                     rank, total_stars, total_destruction, total_attacks,
                     fetched_at, UNIQUE(season_id, clan_id))
players             (id, tag UNIQUE, name)
player_season_stats (id, season_clan_id→season_clans, player_id→players,
                     townhall_level, map_position,
                     attacks_used, attacks_available,
                     stars, destruction_avg,
                     three_stars, two_stars, one_stars, zero_stars, missed,
                     defenses, defensive_stars, defensive_destruction,
                     UNIQUE(season_clan_id, player_id))
```

- **Dashboard** (clan + season) = one `season_clans` row (summary cards) +
  its `player_season_stats` rows (sortable table).
- **Career** (player) = aggregate `player_season_stats` grouped by `player_id`
  across seasons/clans: total stars, average stars/destruction, CV progression,
  seasons played.
- All writes are **upserts** keyed by the UNIQUE constraints → idempotent, safe
  to re-run daily.

## CoC API Integration

Endpoints (via proxy):
- `GET /clans/{clanTag}/currentwar/leaguegroup` → `season`, `clans[]`,
  `rounds[].warTags[]` (7 rounds).
- `GET /clanwarleagues/wars/{warTag}` → war with `clan`/`opponent`, each having
  `members[]` (`tag`, `name`, `townhallLevel`, `mapPosition`, `attacks[]`,
  `bestOpponentAttack`).

Derivation per clan per season:
1. Fetch `leaguegroup`. If 404 / not in CWL → record "no active league", exit.
2. From `rounds[].warTags`, fetch each war; select wars where our clan is
   `clan` or `opponent`.
3. For each of our members: CV = `townhallLevel`; attacks = `attacks[]`
   (stars, destruction, count vs available); defense = stars/destruction from
   opponent attacks targeting that member (`bestOpponentAttack` + opponent
   `attacks[]` filtered by `defenderTag`).
4. Aggregate into `player_season_stats`; aggregate clan totals into
   `season_clans`. Upsert.

### Constraints
- `leaguegroup` exists **only during the active CWL**; it disappears once the
  next season's prep begins. Daily cron during days ~1–12 always captures while
  it exists, so no manual timing is required.
- CoC API token is **IP-locked** → all calls route through `proxy.royaleapi.dev`,
  whose fixed IP is whitelisted on the token.

## Automatic Capture (Vercel Cron)

- **Cadence:** once per day, days 1–12 of each month (free-tier friendly).
- **Job:** for each clan slot → `client` → `mapper` → `db` upsert. Idempotent.
- Accumulates all 7 rounds over the season; the last run before the league ends
  holds the final complete data.
- Records a `last_run` status (timestamp, per-clan result/error) for the admin
  page.

## Admin (backup)

- Supabase Auth-protected `/admin`.
- "Force refresh now" button → runs the same capture path on demand.
- Shows last-run status and any per-clan errors.

## Public Pages

- **Dashboard** — clan tabs (1/2/3) + season selector. Summary cards
  (stars, destruction %, attacks, rank) + sortable player table with CV badge,
  attacks, stars, destruction, defensive stars. Dark Clash theme (mockup B).
- **Career** — per-player page: totals, averages, CV progression, season list.
- Read-only from the database; no live API calls.

## Testing

- `lib/coc/mapper.ts` tested with **fixtures derived from the PDF** (the PDF
  page-1 aggregate is the expected output) — verifies attack/defense/CV
  computation without network.
- `lib/coc/client.ts` and `lib/db/*` tested with mocks/local Supabase.
- Cron route tested with a mocked client + in-memory/mocked db.

## Open Items / Risks
- Confirm the three clan tags against the API on first run (O vs 0).
- RoyaleAPI proxy token setup must be done before the first deploy fetch.
- Vercel free-tier cron is daily-only; if a finer cadence is later needed, it
  requires a paid plan.
