# Raw Attacks, Aggregate-on-Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every attack as a raw DB row and aggregate at display time, so stat-formula changes never require re-uploading the CSV.

**Architecture:** A single `attacks` table is the source of truth. Upload upserts raw rows (dedupe on `war_id,order_`). `reads.ts` loads raw rows and runs the existing `aggregate()` per clan to build dashboard/career/season data. Old pre-aggregated tables are dropped.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Supabase (Postgres), vitest.

---

## File Structure

- `supabase/migrations/0002_attacks.sql` — **new**: drop old tables, create `attacks`.
- `src/lib/csv/parse.ts` — **modify**: add `order` to `AttackRow`.
- `src/lib/db/attacks.ts` — **new**: DB row mappers + `insertAttacks` / `loadAttacks`.
- `src/lib/db/reads.ts` — **rewrite**: aggregate-on-read with pure transforms.
- `src/app/admin/actions.ts` — **modify**: `uploadCsv` inserts raw rows.
- `src/components/UploadForm.tsx` — **modify**: show attacks count.
- Deleted: `src/lib/db/snapshots.ts`, `tests/db/snapshots.test.ts`.

---

## Task 1: Migration — drop old tables, create `attacks`

**Files:**
- Create: `supabase/migrations/0002_attacks.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0002_attacks.sql`:
```sql
-- Replace pre-aggregated tables with a single raw attacks table.
drop table if exists player_season_stats;
drop table if exists season_clans;
drop table if exists cron_runs;
drop table if exists players;
drop table if exists seasons;

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

create index attacks_home_clan_idx on attacks (home_clan_tag);

alter table attacks enable row level security;
create policy "public read attacks" on attacks for select using (true);
```

- [ ] **Step 2: Verify the SQL parses (syntax sanity)**

Run:
```bash
grep -c "create table attacks" supabase/migrations/0002_attacks.sql
```
Expected: `1`. (The migration is applied against Supabase manually by the user; no local DB run here.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_attacks.sql
git commit -m "feat: migration for raw attacks table"
```

---

## Task 2: Add `order` to AttackRow

**Files:**
- Modify: `src/lib/csv/parse.ts`
- Test: `tests/csv/parse.test.ts`

- [ ] **Step 1: Extend the failing test**

In `tests/csv/parse.test.ts`, inside the first test (`parses a quoted comma-name row with a BOM`), add after the `expect(rows[0].tag)` assertion:
```ts
    expect(rows[0].order).toBe(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/csv/parse.test.ts`
Expected: FAIL — `rows[0].order` is `undefined`.

- [ ] **Step 3: Add the field to the type, required list, and mapping**

In `src/lib/csv/parse.ts`:

Add to the `AttackRow` interface, right after `warID: number;`:
```ts
  order: number;
```

Add `"order_"` to the `REQUIRED` array (append it after `"warID"`... it is enough to add anywhere; put it after `"warID"`):
```ts
  "tag", "name", "rank", "thLevel", "warID", "order_", "stars", "new_stars",
```

In the `.map(...)` return object, add after `warID: Number(r.warID),`:
```ts
    order: Number(r.order_),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/csv/parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/parse.ts tests/csv/parse.test.ts
git commit -m "feat: capture attack order_ in AttackRow"
```

---

## Task 3: Attacks DB module (mappers + insert/load)

**Files:**
- Create: `src/lib/db/attacks.ts`
- Test: `tests/db/attacks.test.ts`

- [ ] **Step 1: Write the failing round-trip test**

`tests/db/attacks.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { attackRowToDb, dbRowToAttack } from "../../src/lib/db/attacks";
import type { AttackRow } from "../../src/lib/csv/parse";

const row: AttackRow = {
  tag: "#A", name: "Atk", rank: 3, thLevel: 17, warID: 999, order: 5,
  stars: 2, newStars: 1, destructionPercentage: 84,
  defenderTag: "#D", defenderName: "Def", defenderRank: 7, defenderTH: 18,
  attackerIsHomeClan: 1, homeClanTag: "#90YVJJC8",
  warStartTime: "2026-06-19 09:28:12", type: "league",
};

describe("attacks db mappers", () => {
  it("round-trips an AttackRow through the DB shape", () => {
    const back = dbRowToAttack(attackRowToDb(row));
    expect(back).toEqual(row);
  });

  it("maps attacker_is_home_clan to a boolean and back to 0/1", () => {
    const db = attackRowToDb(row);
    expect(db.attacker_is_home_clan).toBe(true);
    expect(dbRowToAttack({ ...db, attacker_is_home_clan: false }).attackerIsHomeClan).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/attacks.test.ts`
Expected: FAIL — cannot find module `attacks`.

- [ ] **Step 3: Write the implementation**

`src/lib/db/attacks.ts`:
```ts
import type { AttackRow } from "../csv/parse";
import { publicClient, serviceClient } from "./supabase";

export interface AttackDbRow {
  war_id: number;
  order_: number;
  attacker_tag: string;
  attacker_name: string;
  attacker_rank: number;
  attacker_th: number;
  defender_tag: string;
  defender_name: string;
  defender_rank: number;
  defender_th: number;
  stars: number;
  new_stars: number;
  destruction: number;
  attacker_is_home_clan: boolean;
  home_clan_tag: string;
  war_start_time: string;
  type: string;
}

export function attackRowToDb(r: AttackRow): AttackDbRow {
  return {
    war_id: r.warID,
    order_: r.order,
    attacker_tag: r.tag,
    attacker_name: r.name,
    attacker_rank: r.rank,
    attacker_th: r.thLevel,
    defender_tag: r.defenderTag,
    defender_name: r.defenderName,
    defender_rank: r.defenderRank,
    defender_th: r.defenderTH,
    stars: r.stars,
    new_stars: r.newStars,
    destruction: r.destructionPercentage,
    attacker_is_home_clan: r.attackerIsHomeClan === 1,
    home_clan_tag: r.homeClanTag,
    war_start_time: r.warStartTime,
    type: r.type,
  };
}

export function dbRowToAttack(d: AttackDbRow): AttackRow {
  return {
    tag: d.attacker_tag,
    name: d.attacker_name,
    rank: d.attacker_rank,
    thLevel: d.attacker_th,
    warID: d.war_id,
    order: d.order_,
    stars: d.stars,
    newStars: d.new_stars,
    destructionPercentage: Number(d.destruction),
    defenderTag: d.defender_tag,
    defenderName: d.defender_name,
    defenderRank: d.defender_rank,
    defenderTH: d.defender_th,
    attackerIsHomeClan: d.attacker_is_home_clan ? 1 : 0,
    homeClanTag: d.home_clan_tag,
    warStartTime: d.war_start_time,
    type: d.type,
  };
}

/** Upsert raw attacks in batches; dedupes on (war_id, order_). */
export async function insertAttacks(rows: AttackRow[]): Promise<number> {
  const db = serviceClient();
  const dbRows = rows.map(attackRowToDb);
  for (let i = 0; i < dbRows.length; i += 500) {
    const { error } = await db
      .from("attacks")
      .upsert(dbRows.slice(i, i + 500), { onConflict: "war_id,order_" });
    if (error) throw error;
  }
  return dbRows.length;
}

/** Load raw attacks, paginating past Supabase's 1000-row default cap. */
export async function loadAttacks(homeClanTag?: string): Promise<AttackRow[]> {
  const db = publicClient();
  const pageSize = 1000;
  const out: AttackRow[] = [];
  for (let from = 0; ; from += pageSize) {
    let q = db.from("attacks").select("*").order("id").range(from, from + pageSize - 1);
    if (homeClanTag) q = q.eq("home_clan_tag", homeClanTag);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []).map((d) => dbRowToAttack(d as AttackDbRow));
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/attacks.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/attacks.ts tests/db/attacks.test.ts
git commit -m "feat: attacks DB module with row mappers and paginated load"
```

---

## Task 4: Rewrite reads.ts to aggregate on read

**Files:**
- Modify (replace contents): `src/lib/db/reads.ts`
- Test: `tests/db/reads.test.ts`

- [ ] **Step 1: Write the failing test for the pure transforms**

`tests/db/reads.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  dashboardFromSnapshots,
  seasonsFromSnapshots,
  careerFromSnapshots,
} from "../../src/lib/db/reads";
import type { SeasonSnapshot } from "../../src/lib/csv/aggregate";
import type { PlayerSeasonStats } from "../../src/lib/types";

function player(p: Partial<PlayerSeasonStats>): PlayerSeasonStats {
  return {
    tag: "#P1", name: "P1", townhallLevel: 17, mapPosition: 1,
    attacksUsed: 2, attacksAvailable: 2, stars: 5, destructionAvg: 80,
    threeStars: 1, twoStars: 1, oneStars: 0, zeroStars: 0, missed: 0,
    defenses: 1, defensiveStars: 2, defensiveDestruction: 40,
    ...p,
  };
}

const snaps: SeasonSnapshot[] = [
  {
    seasonKey: "2026-06-19",
    snapshot: {
      clanTag: "#90YVJJC8", totalStars: 5, totalAttacks: 2, totalDestruction: 80,
      players: [player({})],
    },
  },
  {
    seasonKey: "2026-06-03",
    snapshot: {
      clanTag: "#90YVJJC8", totalStars: 3, totalAttacks: 2, totalDestruction: 70,
      players: [player({ stars: 3, attacksUsed: 2 })],
    },
  },
];

describe("seasonsFromSnapshots", () => {
  it("returns distinct keys sorted desc with labels", () => {
    expect(seasonsFromSnapshots(snaps)).toEqual([
      { key: "2026-06-19", label: "Liga 19/06/2026" },
      { key: "2026-06-03", label: "Liga 03/06/2026" },
    ]);
  });
});

describe("dashboardFromSnapshots", () => {
  const clan = { tag: "#90YVJJC8", name: "Brazilian House 1", slot: 1 };

  it("maps the matching season's snapshot to dashboard shape", () => {
    const d = dashboardFromSnapshots(clan, "2026-06-19", snaps)!;
    expect(d.season.label).toBe("Liga 19/06/2026");
    expect(d.totals.total_stars).toBe(5);
    expect(d.totals.rank).toBeNull();
    expect(d.players[0].defensive_stars).toBe(2);
    expect(d.players[0].attacks_available).toBe(2);
  });

  it("returns null when the season is absent", () => {
    expect(dashboardFromSnapshots(clan, "2099-01-01", snaps)).toBeNull();
  });
});

describe("careerFromSnapshots", () => {
  it("builds history and totals for a player across clans", () => {
    const c = careerFromSnapshots("#P1", [{ clanName: "Brazilian House 1", snaps }])!;
    expect(c.player.name).toBe("P1");
    expect(c.totals.seasons).toBe(2);
    expect(c.totals.stars).toBe(8); // 5 + 3
    expect(c.totals.attacks).toBe(4); // 2 + 2
    expect(c.history[0].seasonKey).toBe("2026-06-19"); // sorted desc
    expect(c.history[0].clanName).toBe("Brazilian House 1");
  });

  it("returns null when the player has no attacks", () => {
    expect(careerFromSnapshots("#NOBODY", [{ clanName: "X", snaps }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/reads.test.ts`
Expected: FAIL — the named exports don't exist yet.

- [ ] **Step 3: Replace `src/lib/db/reads.ts`**

`src/lib/db/reads.ts`:
```ts
import { publicClient } from "./supabase";
import { loadAttacks } from "./attacks";
import { aggregate, type SeasonSnapshot } from "../csv/aggregate";
import { seasonLabel } from "../coc/season";
import type { AttackRow } from "../csv/parse";

export interface DashboardData {
  clan: { tag: string; name: string; slot: number };
  season: { key: string; label: string };
  totals: { total_stars: number; total_destruction: number; total_attacks: number; rank: number | null };
  players: PlayerRow[];
}

export interface PlayerRow {
  tag: string;
  name: string;
  townhall_level: number;
  map_position: number;
  attacks_used: number;
  attacks_available: number;
  stars: number;
  destruction_avg: number;
  defenses: number;
  defensive_stars: number;
}

export interface CareerData {
  player: { tag: string; name: string };
  totals: { seasons: number; stars: number; attacks: number; avgStars: number; avgDestruction: number };
  history: { seasonKey: string; clanName: string; townhall_level: number; stars: number; destruction_avg: number; defensive_stars: number }[];
}

export interface CareerInputClan {
  clanName: string;
  snaps: SeasonSnapshot[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function groupByClan(rows: AttackRow[]): Map<string, AttackRow[]> {
  const byClan = new Map<string, AttackRow[]>();
  for (const r of rows) {
    let arr = byClan.get(r.homeClanTag);
    if (!arr) {
      arr = [];
      byClan.set(r.homeClanTag, arr);
    }
    arr.push(r);
  }
  return byClan;
}

// --- pure transforms (unit-tested) ---

export function seasonsFromSnapshots(snaps: SeasonSnapshot[]): { key: string; label: string }[] {
  const keys = [...new Set(snaps.map((s) => s.seasonKey))];
  keys.sort((a, b) => b.localeCompare(a));
  return keys.map((key) => ({ key, label: seasonLabel(key) }));
}

export function dashboardFromSnapshots(
  clan: { tag: string; name: string; slot: number },
  seasonKey: string,
  snaps: SeasonSnapshot[],
): DashboardData | null {
  const found = snaps.find((s) => s.seasonKey === seasonKey);
  if (!found) return null;
  const snap = found.snapshot;
  const players: PlayerRow[] = snap.players.map((p) => ({
    tag: p.tag,
    name: p.name,
    townhall_level: p.townhallLevel,
    map_position: p.mapPosition,
    attacks_used: p.attacksUsed,
    attacks_available: p.attacksAvailable,
    stars: p.stars,
    destruction_avg: p.destructionAvg,
    defenses: p.defenses,
    defensive_stars: p.defensiveStars,
  }));
  return {
    clan,
    season: { key: seasonKey, label: seasonLabel(seasonKey) },
    totals: {
      total_stars: snap.totalStars,
      total_destruction: snap.totalDestruction,
      total_attacks: snap.totalAttacks,
      rank: null,
    },
    players,
  };
}

export function careerFromSnapshots(tag: string, clans: CareerInputClan[]): CareerData | null {
  const decoded = tag.startsWith("#") ? tag : `#${tag}`;
  const rows: (CareerData["history"][number] & { attacksUsed: number })[] = [];
  let playerName = "";
  for (const c of clans) {
    for (const s of c.snaps) {
      const p = s.snapshot.players.find((pl) => pl.tag === decoded);
      if (!p) continue;
      playerName = p.name;
      rows.push({
        seasonKey: s.seasonKey,
        clanName: c.clanName,
        townhall_level: p.townhallLevel,
        stars: p.stars,
        destruction_avg: p.destructionAvg,
        defensive_stars: p.defensiveStars,
        attacksUsed: p.attacksUsed,
      });
    }
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.seasonKey.localeCompare(a.seasonKey));

  const seasons = rows.length;
  const stars = rows.reduce((s, h) => s + h.stars, 0);
  const attacks = rows.reduce((s, h) => s + h.attacksUsed, 0);
  const destSum = rows.reduce((s, h) => s + h.destruction_avg, 0);

  return {
    player: { tag: decoded, name: playerName },
    totals: {
      seasons,
      stars,
      attacks,
      avgStars: attacks > 0 ? round2(stars / attacks) : 0,
      avgDestruction: seasons > 0 ? round2(destSum / seasons) : 0,
    },
    history: rows.map(({ attacksUsed, ...h }) => h),
  };
}

// --- DB-backed reads ---

export async function listClans(): Promise<{ tag: string; name: string; slot: number }[]> {
  const db = publicClient();
  const { data } = await db.from("clans").select("tag,name,slot").order("slot");
  return data ?? [];
}

export async function listSeasons(): Promise<{ key: string; label: string }[]> {
  const byClan = groupByClan(await loadAttacks());
  const all: SeasonSnapshot[] = [];
  for (const rows of byClan.values()) all.push(...aggregate(rows));
  return seasonsFromSnapshots(all);
}

export async function getDashboard(slot: number, seasonKey: string): Promise<DashboardData | null> {
  const db = publicClient();
  const { data: clan } = await db.from("clans").select("tag,name,slot").eq("slot", slot).single();
  if (!clan) return null;
  const snaps = aggregate(await loadAttacks(clan.tag));
  return dashboardFromSnapshots(clan, seasonKey, snaps);
}

export async function getCareer(tag: string): Promise<CareerData | null> {
  const db = publicClient();
  const { data: clans } = await db.from("clans").select("tag,name");
  const byClan = groupByClan(await loadAttacks());
  const input: CareerInputClan[] = [];
  for (const [clanTag, rows] of byClan) {
    const name = (clans ?? []).find((c) => c.tag === clanTag)?.name ?? clanTag;
    input.push({ clanName: name, snaps: aggregate(rows) });
  }
  return careerFromSnapshots(tag, input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/reads.test.ts`
Expected: PASS (all five tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/reads.ts tests/db/reads.test.ts
git commit -m "feat: aggregate dashboard/career/seasons on read from raw attacks"
```

---

## Task 5: uploadCsv inserts raw rows; UploadForm shows attacks

**Files:**
- Modify (replace contents): `src/app/admin/actions.ts`
- Modify: `src/components/UploadForm.tsx`

- [ ] **Step 1: Replace the action**

`src/app/admin/actions.ts`:
```ts
"use server";
import { parseAttacksCsv } from "../../lib/csv/parse";
import { aggregate } from "../../lib/csv/aggregate";
import { insertAttacks } from "../../lib/db/attacks";

export interface UploadResult {
  fileName: string;
  clanTag?: string;
  seasons: string[];
  attacks: number;
  status: "ok" | "error";
  message?: string;
}

export async function uploadCsv(formData: FormData): Promise<UploadResult[]> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const results: UploadResult[] = [];

  for (const file of files) {
    try {
      const rows = parseAttacksCsv(await file.text());
      const attacks = await insertAttacks(rows);
      const seasons = aggregate(rows).map((s) => s.seasonKey); // feedback only
      results.push({
        fileName: file.name,
        clanTag: rows[0]?.homeClanTag,
        seasons,
        attacks,
        status: "ok",
        message: seasons.length === 0 ? "sem guerras de liga (linhas cruas salvas)" : undefined,
      });
    } catch (e) {
      results.push({
        fileName: file.name,
        seasons: [],
        attacks: 0,
        status: "error",
        message: (e as Error).message,
      });
    }
  }
  return results;
}
```

- [ ] **Step 2: Update the result line in UploadForm**

In `src/components/UploadForm.tsx`, replace the success branch of the result `<li>`:

Change:
```tsx
              {r.status === "ok"
                ? `${r.clanTag} · ${r.seasons.join(", ")} · ${r.players} jogadores`
                : r.message}
```
to:
```tsx
              {r.status === "ok"
                ? `${r.clanTag} · ${r.seasons.join(", ") || "sem liga"} · ${r.attacks} ataques`
                : r.message}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only about `src/lib/db/snapshots.ts` (still references removed types/tables) — that file is deleted in Task 6. If any OTHER file errors, fix it. Do not re-add `players`/`snapshots`.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/actions.ts src/components/UploadForm.tsx
git commit -m "feat: upload inserts raw attacks; show attacks count"
```

---

## Task 6: Delete snapshots module; final verification

**Files:**
- Delete: `src/lib/db/snapshots.ts`, `tests/db/snapshots.test.ts`

- [ ] **Step 1: Delete the obsolete module + test**

Run:
```bash
git rm src/lib/db/snapshots.ts tests/db/snapshots.test.ts
```

- [ ] **Step 2: Verify no dangling references**

Run:
```bash
grep -rn "snapshots\|persistSnapshot\|player_season_stats\|season_clans\|from(\"players\")\|from('players')\|from(\"seasons\")" src
```
Expected: no output. If anything appears, remove it.

- [ ] **Step 3: Typecheck + full test suite**

Run:
```bash
npx tsc --noEmit && npx vitest run
```
Expected: no type errors; all tests pass (parse, aggregate, season, attacks, reads).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: drop pre-aggregated snapshots module"
```

---

## Task 7: Rollout notes (no code)

- [ ] **Step 1: Apply the migration on Supabase**

The user applies `supabase/migrations/0002_attacks.sql` against the project DB
(drops old tables, creates `attacks`).

- [ ] **Step 2: Populate once**

Log in at `/admin`, upload each clan's `*_war_attacks.csv`. Expect a result line
like `#90YVJJC8 · 2026-06-03, 2026-06-19 · N ataques`.

- [ ] **Step 3: Confirm**

Open the dashboard; the two June leagues appear as separate seasons. From now on,
stat-formula changes are read-time only — no re-upload needed.
