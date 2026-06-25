# Raw Attacks, Aggregate-on-Read — Design

**Date:** 2026-06-25
**Status:** Approved

## Problem

Stats are currently aggregated at **upload** time and stored pre-computed in
`season_clans` / `player_season_stats`. Any change to a formula (e.g. defensive
stars = denied) forces a full CSV re-upload to recompute stored values.

We want raw attacks stored once, and **all aggregation done at display time**, so
formula changes never require re-uploading. Each attack is one row; the dashboard
and career pages aggregate on the fly.

## Decisions

- **Aggregation in TS**, reusing the existing `aggregate()`. Data volume is small
  (~100 attacks per clan per league), so fetch raw rows and aggregate in Node.
- **Store all attacks** (`league` and `normal`); filter `type='league'` at read.
  Keeps normal-war data without a future re-upload.
- **Replace** the pre-aggregated tables with a single `attacks` table.
- **Drop `players`** — player identity (tag/name) lives on each attack row.
- Season identity = the league's **start date** (`YYYY-MM-DD`), produced by
  `aggregate()`'s gap clustering.

## Schema — migration `supabase/migrations/0002_attacks.sql`

Drops `seasons`, `season_clans`, `player_season_stats`, `cron_runs`, `players`.
Keeps `clans` (slot → tag, used by routes and the seed rows). Creates:

```sql
create table attacks (
  id bigint generated always as identity primary key,
  war_id bigint not null,
  order_ int not null,
  attacker_tag text not null,
  attacker_name text not null,
  attacker_rank int not null,
  attacker_th int not null,
  defender_tag text not null,
  defender_name text not null,
  defender_rank int not null,
  defender_th int not null,
  stars int not null,
  new_stars int not null,
  destruction numeric not null,
  attacker_is_home_clan boolean not null,
  home_clan_tag text not null,
  war_start_time text not null,   -- "YYYY-MM-DD HH:MM:SS"
  type text not null,             -- "league" | "normal"
  unique (war_id, order_)
);
```

- `unique (war_id, order_)`: `order_` is the attack sequence within a war and is
  unique per `war_id`, so re-uploading the same CSV **upserts** (no duplicates).
- `war_start_time` stored as text to preserve the existing league-clustering
  logic (`aggregate()` slices the date string).
- RLS: public `select`; inserts/upserts run with the service-role key.

## Components

### `src/lib/csv/parse.ts`
Unchanged. `parseAttacksCsv(text) → AttackRow[]`.

### `src/lib/csv/aggregate.ts`
Unchanged. `aggregate(rows: AttackRow[]) → SeasonSnapshot[]`, filters
`type === 'league'`, clusters leagues by date gap, computes per-player stats
(including denied defensive stars and approximate missed).

### `src/lib/db/attacks.ts` (new)
- `attackRowToDb(r: AttackRow): AttackDbRow` and `dbRowToAttack(d): AttackRow` —
  pure mappers between the parsed shape and the table columns.
- `insertAttacks(rows: AttackRow[]): Promise<number>` — upsert on
  `(war_id, order_)` via the service client; returns row count.
- `loadAttacks(homeClanTag?: string): Promise<AttackRow[]>` — public client read;
  optional filter by `home_clan_tag`. Maps DB rows back to `AttackRow`.

### `src/lib/db/reads.ts` (rewritten)
Aggregates at read using `loadAttacks` + `aggregate`:
- `listClans()` — unchanged (`clans` table, ordered by slot).
- `listSeasons()` — `aggregate(loadAttacks())` across all clans; collect distinct
  `seasonKey`s; map to `{ key, label: seasonLabel(key) }`; sort by key desc.
- `getDashboard(slot, seasonKey)` — resolve clan by slot → tag;
  `aggregate(loadAttacks(tag))`; find the snapshot whose `seasonKey` matches;
  return `{ clan, season, totals, players }`. `totals.rank` is `null` (single-clan
  data cannot rank within a CWL group). Returns `null` if clan or season missing.
- `getCareer(tag)` — `aggregate(loadAttacks())` per clan; for each snapshot,
  pull the player's `PlayerSeasonStats`; build career totals + history sorted by
  season desc. Returns `null` if the player has no attacks.

The `PlayerRow` / `DashboardData` / `CareerData` shapes the components consume
stay the same, so `PlayerTable`, the dashboard, and the career page are unchanged.

### `src/app/admin/actions.ts`
`uploadCsv(formData)` parses each file then calls `insertAttacks` (raw upsert).
No aggregation is persisted. The per-file `UploadResult` still reports `clanTag`,
detected `seasons` (from `aggregate` on the parsed rows, for feedback only), and a
`players` count.

### Deleted
`src/lib/db/snapshots.ts` (replaced by `attacks.ts`). Its test
`tests/db/snapshots.test.ts` is removed.

## Data Flow

```
upload:  CSV → parseAttacksCsv → AttackRow[] → insertAttacks (upsert raw)
display: loadAttacks → aggregate() → SeasonSnapshot[] → dashboard / career
```

## Error Handling

- Bad/missing CSV header → `parseAttacksCsv` throws → reported per file.
- No league rows in a file → upload still inserts raw rows; the feedback
  `seasons` list is empty and the result notes "sem guerras de liga".
- `getDashboard` / `getCareer` return `null` for missing clan/season/player →
  existing `notFound()` handling applies.

## Edge Cases & Assumptions

- Season key = league start date. Assumes the three clans share CWL round-1 dates
  (global CWL schedule), so `listSeasons` keys match the per-clan snapshot keys.
- A war between two of our own clans (same `war_id` in two files) is deduped by
  `(war_id, order_)`; the home perspective stored is whichever file loaded last.
  Not expected in practice.

## Testing

- `attacks.ts`: `attackRowToDb` → `dbRowToAttack` round-trip preserves every field
  (pure unit test, no DB).
- `aggregate.test.ts`, `parse.test.ts`, `season.test.ts` stay green.
- The dashboard/career mapping is thin over `aggregate`, already unit-tested;
  no DB integration test (Supabase env not available in CI).

## Migration / Rollout

1. Apply `0002_attacks.sql` (drops old tables, creates `attacks`).
2. Upload the clan CSVs once to populate `attacks`.
3. Thereafter, formula changes are read-time only — no re-upload.
