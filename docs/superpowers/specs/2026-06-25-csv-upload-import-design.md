# CSV Upload Import — Design

**Date:** 2026-06-25
**Status:** Approved

## Problem

The app captures CWL stats by polling the Clash of Clans API (via the RoyaleAPI
proxy). The proxy path returns `invalidScope` and the API requires a static
whitelisted IP that Vercel cannot provide. We are abolishing the API model.

Instead, at the end of a war league an admin uploads each clan's results as a
CSV (`<CLAN>_war_attacks.csv`). The file is parsed in memory, aggregated, and
the computed values are saved to the database. **The file itself is not stored.**

## Approach

Replace API capture with admin CSV upload. Reuse the existing `persistSnapshot`
and the database schema **unchanged**. Add a CSV parse + aggregate layer that
mirrors the current `mapSeason` aggregation, but reads attack rows instead of
API war objects. Retire the CoC API client, the cron route, and the dashboard
refresh button.

Rejected alternatives:
- Keep the API as a fallback alongside CSV — user said abolish the API.
- Store the CSV in Supabase Storage then process — user said do not store the file.

## CSV Format

One row per attack. Both sides of every war involving the home clan are present.
Header (25 columns):

```
tag,name,rank,thLevel,warID,order_,attackerTag,defenderTag,stars,new_stars,
destructionPercentage,war_player.defenderTag,defenderName,defenderRank,defenderTH,
attacker_is_home_clan,home_clan_tag,home_clan_name,home_clan_level,
enemy_clan_tag,enemy_clan_name,enemy_clan_level,war_start_time,war_size,type
```

Notes:
- UTF-8 with BOM.
- Fields containing commas are quoted (e.g. a player named `,Garou'`). A real
  RFC4180 parser is required — naive comma-split breaks.
- `attacker_is_home_clan`: `1` = home-clan member attacking (offense rows),
  `0` = enemy attacking a home-clan member (defense rows).
- `home_clan_tag` is constant within a file → identifies the clan.
- `type` is `league` or `normal`. `war_start_time` is `YYYY-MM-DD HH:MM:SS`.
- `stars` = stars the attacker scored. `new_stars` = stars newly contributed to
  the clan (lower on same-base re-attacks). We use `stars`.

## Decisions

- **Scope:** only `type === 'league'` rows (CWL). Normal wars ignored.
- **Star metric:** player `stars` = sum of `stars` (not `new_stars`).
- **Missed attacks:** `attacksAvailable` = number of distinct league wars the
  player appears in (as attacker or defender). `missed = attacksAvailable -
  attacksUsed`. Members who never attacked and were never attacked are invisible
  in the file and therefore not counted — accepted approximation.
- **Clan rank:** a single-clan file cannot yield the clan's placement in its CWL
  group. `rank` is persisted as `null`; the dashboard rank column shows `—`.
  `computeRanks` is removed.

## Components

### `src/lib/csv/parse.ts`
`parseAttacksCsv(text: string): AttackRow[]`
- Parse with `papaparse` (`header: true`, `skipEmptyLines: true`, BOM handled).
- Validate the header contains all required columns; throw a descriptive error
  otherwise.
- Coerce numeric fields (`stars`, `new_stars`, `destructionPercentage`,
  `thLevel`, `rank`, `defenderTH`, `defenderRank`, `attacker_is_home_clan`,
  `warID`) to numbers; keep tags/names/`type`/`war_start_time` as strings.

### `src/lib/csv/aggregate.ts`
`aggregate(rows: AttackRow[]): SeasonSnapshot[]`
where `SeasonSnapshot = { seasonKey: string; snapshot: ClanSeasonSnapshot }`.

- Keep only `type === 'league'` rows.
- `clanTag` = the file's `home_clan_tag` (assert single value).
- Group rows by `seasonKey` = `YYYY-MM` of `war_start_time`. A file spanning two
  CWL months produces two snapshots.
- Within a season:
  - **Offense** (`attacker_is_home_clan === 1`), grouped by attacker `tag`:
    `attacksUsed = Σ rows`, `stars = Σ stars`,
    `destructionAvg = avg(destructionPercentage)`,
    `threeStars/twoStars/oneStars/zeroStars` from `stars` buckets.
    `name`/`townhallLevel`/`mapPosition` from `name`/`thLevel`/`rank`.
  - **Defense** (`attacker_is_home_clan === 0`), grouped by `defenderTag`:
    per `warID` keep the best enemy attack (max `stars`, tiebreak
    `destructionPercentage`). `defenses = number of defended wars`,
    `defensiveStars = Σ best.stars`, `defensiveDestruction = avg(best.dest)`.
    For defense-only players, fill `name`/`townhallLevel`/`mapPosition` from
    `defenderName`/`defenderTH`/`defenderRank`.
  - **Roster union:** players = union of offense tags and defense `defenderTag`s.
    `attacksAvailable` = count of distinct league `warID`s in which the player
    appears on either side. `missed = attacksAvailable - attacksUsed` (min 0).
  - **Clan totals:** `totalStars = Σ player.stars`, `totalAttacks = Σ attacksUsed`,
    `totalDestruction = avg(destructionPercentage over all offense attacks)`.
  - Sort players by `mapPosition`.
- Output type is the existing `ClanSeasonSnapshot` / `PlayerSeasonStats`.

### Domain types
Move `ClanSeasonSnapshot` and `PlayerSeasonStats` out of `src/lib/coc/types.ts`
to `src/lib/types.ts` (the `coc/` raw-API types are retired). Update imports in
`snapshots.ts`.

### `persistSnapshot`
Reused unchanged. Called once per `SeasonSnapshot` with `rank = null`.

### Admin server action — `src/app/admin/actions.ts`
Replace `forceRefresh` with:
`uploadCsv(formData: FormData): Promise<UploadResult[]>`
- For each uploaded file: read `text()`, `parseAttacksCsv`, `aggregate`,
  `persistSnapshot` for each season. Discard the text after parsing.
- Return per-file `{ fileName, clanTag, seasons: string[], players: number,
  status: 'ok' | 'error', message? }`.
- One failing file does not abort the others.

### Admin UI — `src/app/admin/page.tsx`
- `<input type="file" accept=".csv" multiple>` inside a form posting to
  `uploadCsv`. Show a per-file result list after submit. Keep the existing
  "últimos runs" list.
- A small client component handles the pending state (mirrors `RefreshButton`),
  then `router.refresh()`.

## Retire

- `src/lib/coc/client.ts`, `src/lib/coc/capture.ts`, `src/lib/coc/mapper.ts`
- `src/app/api/cron/route.ts` and the `crons` entry in `vercel.json`
- `src/components/RefreshButton.tsx` and its use in the dashboard
- `forceRefresh` action
- `COC_API_TOKEN`, `COC_API_BASE`, `CLAN_*_TAG` env (CLAN tags no longer needed —
  identity comes from the file). Update `.env.example`.

## Data Flow

```
admin selects N CSVs
  → for each file: bytes → text → parseAttacksCsv → AttackRow[]
       → aggregate → SeasonSnapshot[]
          → persistSnapshot(seasonKey, snapshot, rank=null) → Supabase
  → file bytes discarded (held only in memory during the request)
  → per-file result rendered
```

## Error Handling

- Missing/invalid header → reject that file with a descriptive message.
- `home_clan_tag` not present in the `clans` table → `persistSnapshot` clan
  lookup fails → reported as that file's error.
- No `type === 'league'` rows → "sem guerras de liga no arquivo".
- Inconsistent `home_clan_tag` within one file → error.

## Testing

Unit tests (vitest):
- `parse`: quoted comma-name row and BOM are parsed correctly; bad header throws.
- `aggregate`: from a trimmed fixture derived from the real CSV covering
  offense + defense, a missed attack, a same-base re-attack (`stars` ≠
  `new_stars`), `league` vs `normal` filtering, and two-month season grouping →
  asserts the expected `ClanSeasonSnapshot`(s).

## New Dependency

`papaparse` + `@types/papaparse`.
