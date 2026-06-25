# Brazilian House CWL Stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js site that automatically captures Clash of Clans CWL per-player attack/defense/Town-Hall stats into Supabase and shows per-clan/season dashboards and per-player career pages.

**Architecture:** A pure mapper transforms raw CoC war JSON into per-player season stats. A daily Vercel Cron job fetches CWL data through the RoyaleAPI proxy and upserts snapshots into Supabase. Public pages read only from the database; an admin page offers a manual refresh and last-run status.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind CSS, Supabase (Postgres + Auth), Vitest, Vercel (hosting + Cron), RoyaleAPI proxy.

---

## File Structure

```
src/
  lib/
    coc/
      types.ts          # raw CoC API types (subset) + domain output types
      mapper.ts         # PURE: raw wars -> ClanSeasonSnapshot
      client.ts         # CoC API client via proxy (leaguegroup, war)
      season.ts         # season key helpers + "is CWL window" date logic
    db/
      supabase.ts       # supabase client factory (server + browser)
      snapshots.ts      # upsert snapshot; read last-run
      reads.ts          # dashboard + career read queries
  app/
    (public)/
      page.tsx          # home -> redirect to latest dashboard
      dashboard/[clan]/[season]/page.tsx
      player/[tag]/page.tsx
    admin/
      page.tsx          # protected: force refresh + status
      actions.ts        # server action: run capture
    api/cron/route.ts   # daily job
    layout.tsx
    globals.css
  components/
    SummaryCards.tsx
    PlayerTable.tsx
    ClanTabs.tsx
    SeasonSelect.tsx
supabase/
  migrations/0001_init.sql
tests/
  coc/mapper.test.ts
  coc/season.test.ts
  coc/fixtures/war-round-1.json
  db/snapshots.test.ts
```

---

## Task 1: Scaffold Next.js + TypeScript + Tailwind + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.env.example`

- [ ] **Step 1: Create the Next.js app**

Run (non-interactive):
```bash
cd "C:/Projetos/brazilian-house"
npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --no-import-alias --use-npm --yes
```
Expected: scaffolds into the existing directory. If it refuses due to existing files, move `docs/` and the PDF aside, scaffold, then move them back.

- [ ] **Step 2: Add Vitest**

Run:
```bash
npm install -D vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Add test script to `package.json`**

In the `"scripts"` block add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create `.env.example`**

```
# CoC API token (whitelist the RoyaleAPI proxy IP: 45.79.218.79)
COC_API_TOKEN=
COC_API_BASE=https://proxy.royaleapi.dev/v1

# Clan tags
CLAN_1_TAG=#90YVJJC8
CLAN_2_TAG=#2JG0ULJQG
CLAN_3_TAG=#2CPVJ088C

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Cron auth
CRON_SECRET=
```

- [ ] **Step 6: Verify build + test run**

Run:
```bash
npm run test
```
Expected: passes with "no test files found" (or 0 tests). Then:
```bash
npm run build
```
Expected: Next.js builds successfully.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Tailwind + Vitest"
```

---

## Task 2: Domain + raw API types

**Files:**
- Create: `src/lib/coc/types.ts`

- [ ] **Step 1: Write the types**

```ts
// --- Raw CoC API shapes (subset we consume) ---
export interface RawWarAttack {
  attackerTag: string;
  defenderTag: string;
  stars: number;
  destructionPercentage: number;
  order: number;
}

export interface RawWarMember {
  tag: string;
  name: string;
  townhallLevel: number;
  mapPosition: number;
  attacks?: RawWarAttack[];
  opponentAttacks: number;
  bestOpponentAttack?: RawWarAttack;
}

export interface RawWarClan {
  tag: string;
  name: string;
  stars: number;
  destructionPercentage: number;
  attacks: number;
  members: RawWarMember[];
}

export interface RawCwlWar {
  state: "preparation" | "inWar" | "warEnded" | string;
  teamSize: number;
  clan: RawWarClan;
  opponent: RawWarClan;
}

export interface RawLeagueGroupRound {
  warTags: string[]; // "#0" means not yet assigned
}

export interface RawLeagueGroup {
  state: string;
  season: string; // e.g. "2026-06"
  clans: { tag: string; name: string }[];
  rounds: RawLeagueGroupRound[];
}

// --- Domain output (what we persist) ---
export interface PlayerSeasonStats {
  tag: string;
  name: string;
  townhallLevel: number;
  mapPosition: number;
  attacksUsed: number;
  attacksAvailable: number;
  stars: number;
  destructionAvg: number;
  threeStars: number;
  twoStars: number;
  oneStars: number;
  zeroStars: number;
  missed: number;
  defenses: number;
  defensiveStars: number;
  defensiveDestruction: number;
}

export interface ClanSeasonSnapshot {
  clanTag: string;
  totalStars: number;
  totalDestruction: number; // average destruction across the clan's attacks
  totalAttacks: number;
  players: PlayerSeasonStats[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/coc/types.ts
git commit -m "feat: add CoC API and domain types"
```

---

## Task 3: Pure mapper (TDD core)

**Files:**
- Create: `src/lib/coc/mapper.ts`
- Test: `tests/coc/mapper.test.ts`, `tests/coc/fixtures/war-round-1.json`

- [ ] **Step 1: Create a fixture war**

`tests/coc/fixtures/war-round-1.json` — minimal 2-member war where our clan is `#OURCLAN`:
```json
{
  "state": "warEnded",
  "teamSize": 2,
  "clan": {
    "tag": "#OURCLAN",
    "name": "Brazilian House",
    "stars": 5,
    "destructionPercentage": 95.5,
    "attacks": 2,
    "members": [
      {
        "tag": "#P1", "name": "Cesar", "townhallLevel": 16, "mapPosition": 1,
        "attacks": [{ "attackerTag": "#P1", "defenderTag": "#E1", "stars": 3, "destructionPercentage": 100, "order": 1 }],
        "opponentAttacks": 1,
        "bestOpponentAttack": { "attackerTag": "#E1", "defenderTag": "#P1", "stars": 2, "destructionPercentage": 88, "order": 2 }
      },
      {
        "tag": "#P2", "name": "Meira", "townhallLevel": 15, "mapPosition": 2,
        "attacks": [{ "attackerTag": "#P2", "defenderTag": "#E2", "stars": 2, "destructionPercentage": 91, "order": 3 }],
        "opponentAttacks": 1,
        "bestOpponentAttack": { "attackerTag": "#E2", "defenderTag": "#P2", "stars": 0, "destructionPercentage": 40, "order": 4 }
      }
    ]
  },
  "opponent": {
    "tag": "#ENEMY", "name": "Foe", "stars": 2, "destructionPercentage": 64,
    "attacks": 2, "members": []
  }
}
```

- [ ] **Step 2: Write the failing test**

`tests/coc/mapper.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import war1 from "./fixtures/war-round-1.json";
import { mapSeason } from "../../src/lib/coc/mapper";
import type { RawCwlWar } from "../../src/lib/coc/types";

describe("mapSeason", () => {
  it("aggregates a single war for our clan", () => {
    const snap = mapSeason([war1 as RawCwlWar], "#OURCLAN");

    expect(snap.clanTag).toBe("#OURCLAN");
    expect(snap.players).toHaveLength(2);

    const p1 = snap.players.find((p) => p.tag === "#P1")!;
    expect(p1.name).toBe("Cesar");
    expect(p1.townhallLevel).toBe(16);
    expect(p1.attacksUsed).toBe(1);
    expect(p1.attacksAvailable).toBe(1);
    expect(p1.stars).toBe(3);
    expect(p1.threeStars).toBe(1);
    expect(p1.destructionAvg).toBe(100);
    expect(p1.defenses).toBe(1);
    expect(p1.defensiveStars).toBe(2);
    expect(p1.defensiveDestruction).toBe(88);

    const p2 = snap.players.find((p) => p.tag === "#P2")!;
    expect(p2.twoStars).toBe(1);
    expect(p2.defensiveStars).toBe(0);

    expect(snap.totalStars).toBe(5);
    expect(snap.totalAttacks).toBe(2);
  });

  it("picks our clan whether it is on the clan or opponent side", () => {
    const swapped = { ...(war1 as RawCwlWar), clan: (war1 as RawCwlWar).opponent, opponent: (war1 as RawCwlWar).clan };
    const snap = mapSeason([swapped as RawCwlWar], "#OURCLAN");
    expect(snap.players).toHaveLength(2);
  });

  it("counts a missed attack when a roster member did not attack", () => {
    const w = JSON.parse(JSON.stringify(war1)) as RawCwlWar;
    w.clan.members[1].attacks = [];
    const snap = mapSeason([w], "#OURCLAN");
    const p2 = snap.players.find((p) => p.tag === "#P2")!;
    expect(p2.attacksUsed).toBe(0);
    expect(p2.missed).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npx vitest run tests/coc/mapper.test.ts
```
Expected: FAIL — `mapSeason` not defined.

- [ ] **Step 4: Implement the mapper**

`src/lib/coc/mapper.ts`:
```ts
import type {
  RawCwlWar,
  RawWarClan,
  RawWarMember,
  ClanSeasonSnapshot,
  PlayerSeasonStats,
} from "./types";

function ourSide(war: RawCwlWar, clanTag: string): RawWarClan | null {
  if (war.clan.tag === clanTag) return war.clan;
  if (war.opponent.tag === clanTag) return war.opponent;
  return null;
}

function emptyStats(m: RawWarMember): PlayerSeasonStats {
  return {
    tag: m.tag,
    name: m.name,
    townhallLevel: m.townhallLevel,
    mapPosition: m.mapPosition,
    attacksUsed: 0,
    attacksAvailable: 0,
    stars: 0,
    destructionAvg: 0,
    threeStars: 0,
    twoStars: 0,
    oneStars: 0,
    zeroStars: 0,
    missed: 0,
    defenses: 0,
    defensiveStars: 0,
    defensiveDestruction: 0,
  };
}

export function mapSeason(wars: RawCwlWar[], clanTag: string): ClanSeasonSnapshot {
  const byTag = new Map<string, PlayerSeasonStats>();
  // accumulate destruction sums separately to compute averages at the end
  const destSum = new Map<string, number>();
  const defDestSum = new Map<string, number>();

  for (const war of wars) {
    const side = ourSide(war, clanTag);
    if (!side) continue;

    for (const m of side.members) {
      const stats = byTag.get(m.tag) ?? emptyStats(m);
      // keep the latest name/TH/position seen
      stats.name = m.name;
      stats.townhallLevel = m.townhallLevel;
      stats.mapPosition = m.mapPosition;
      stats.attacksAvailable += 1; // CWL: one attack per war in roster

      const attacks = m.attacks ?? [];
      if (attacks.length === 0) {
        stats.missed += 1;
      }
      for (const a of attacks) {
        stats.attacksUsed += 1;
        stats.stars += a.stars;
        destSum.set(m.tag, (destSum.get(m.tag) ?? 0) + a.destructionPercentage);
        if (a.stars === 3) stats.threeStars += 1;
        else if (a.stars === 2) stats.twoStars += 1;
        else if (a.stars === 1) stats.oneStars += 1;
        else stats.zeroStars += 1;
      }

      if (m.opponentAttacks > 0) {
        stats.defenses += 1;
        if (m.bestOpponentAttack) {
          stats.defensiveStars += m.bestOpponentAttack.stars;
          defDestSum.set(
            m.tag,
            (defDestSum.get(m.tag) ?? 0) + m.bestOpponentAttack.destructionPercentage,
          );
        }
      }

      byTag.set(m.tag, stats);
    }
  }

  let totalStars = 0;
  let totalAttacks = 0;
  let clanDestSum = 0;
  const players: PlayerSeasonStats[] = [];

  for (const stats of byTag.values()) {
    stats.destructionAvg =
      stats.attacksUsed > 0
        ? round2((destSum.get(stats.tag) ?? 0) / stats.attacksUsed)
        : 0;
    stats.defensiveDestruction =
      stats.defenses > 0
        ? round2((defDestSum.get(stats.tag) ?? 0) / stats.defenses)
        : 0;
    totalStars += stats.stars;
    totalAttacks += stats.attacksUsed;
    clanDestSum += destSum.get(stats.tag) ?? 0;
    players.push(stats);
  }

  players.sort((a, b) => a.mapPosition - b.mapPosition);

  return {
    clanTag,
    totalStars,
    totalAttacks,
    totalDestruction: totalAttacks > 0 ? round2(clanDestSum / totalAttacks) : 0,
    players,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx vitest run tests/coc/mapper.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/coc/mapper.ts tests/coc/
git commit -m "feat: pure CWL season mapper with tests"
```

---

## Task 4: Season helpers (key + CWL window)

**Files:**
- Create: `src/lib/coc/season.ts`
- Test: `tests/coc/season.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/coc/season.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { seasonKey, seasonLabel, isCwlWindow } from "../../src/lib/coc/season";

describe("season helpers", () => {
  it("formats season key from a date", () => {
    expect(seasonKey(new Date("2026-06-25T00:00:00Z"))).toBe("2026-06");
  });

  it("formats a human label", () => {
    expect(seasonLabel("2026-06")).toBe("Liga 06/2026");
  });

  it("is in CWL window on days 1-12", () => {
    expect(isCwlWindow(new Date("2026-06-03T00:00:00Z"))).toBe(true);
    expect(isCwlWindow(new Date("2026-06-12T00:00:00Z"))).toBe(true);
  });

  it("is outside CWL window after day 12", () => {
    expect(isCwlWindow(new Date("2026-06-20T00:00:00Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/coc/season.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement**

`src/lib/coc/season.ts`:
```ts
export function seasonKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function seasonLabel(key: string): string {
  const [y, m] = key.split("-");
  return `Liga ${m}/${y}`;
}

export function isCwlWindow(d: Date): boolean {
  const day = d.getUTCDate();
  return day >= 1 && day <= 12;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/coc/season.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coc/season.ts tests/coc/season.test.ts
git commit -m "feat: season key/label/window helpers"
```

---

## Task 5: CoC API client (via proxy)

**Files:**
- Create: `src/lib/coc/client.ts`

- [ ] **Step 1: Implement the client**

`src/lib/coc/client.ts`:
```ts
import type { RawLeagueGroup, RawCwlWar } from "./types";

const BASE = process.env.COC_API_BASE ?? "https://proxy.royaleapi.dev/v1";

function authHeaders(): HeadersInit {
  const token = process.env.COC_API_TOKEN;
  if (!token) throw new Error("COC_API_TOKEN is not set");
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function enc(tag: string): string {
  // CoC tags must be URL-encoded; "#" -> "%23"
  return encodeURIComponent(tag.startsWith("#") ? tag : `#${tag}`);
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`CoC API ${res.status} on ${path}: ${body}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/** Returns null when the clan is not currently in a CWL (API 404). */
export async function getLeagueGroup(clanTag: string): Promise<RawLeagueGroup | null> {
  try {
    return await get<RawLeagueGroup>(`/clans/${enc(clanTag)}/currentwar/leaguegroup`);
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

export async function getCwlWar(warTag: string): Promise<RawCwlWar> {
  return get<RawCwlWar>(`/clanwarleagues/wars/${enc(warTag)}`);
}

/** Fetch every assigned war in a league group (skips unassigned "#0"). */
export async function getSeasonWars(group: RawLeagueGroup): Promise<RawCwlWar[]> {
  const warTags = group.rounds
    .flatMap((r) => r.warTags)
    .filter((t) => t && t !== "#0");
  const wars = await Promise.all(warTags.map((t) => getCwlWar(t)));
  return wars;
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/coc/client.ts
git commit -m "feat: CoC API client via RoyaleAPI proxy"
```

---

## Task 6: Supabase schema

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_init.sql`:
```sql
create table clans (
  id bigint generated always as identity primary key,
  tag text not null unique,
  name text not null,
  slot int not null
);

create table seasons (
  id bigint generated always as identity primary key,
  key text not null unique,        -- "2026-06"
  label text not null
);

create table players (
  id bigint generated always as identity primary key,
  tag text not null unique,
  name text not null
);

create table season_clans (
  id bigint generated always as identity primary key,
  season_id bigint not null references seasons(id),
  clan_id bigint not null references clans(id),
  rank int,
  total_stars int not null default 0,
  total_destruction numeric not null default 0,
  total_attacks int not null default 0,
  fetched_at timestamptz not null default now(),
  unique (season_id, clan_id)
);

create table player_season_stats (
  id bigint generated always as identity primary key,
  season_clan_id bigint not null references season_clans(id) on delete cascade,
  player_id bigint not null references players(id),
  townhall_level int not null,
  map_position int not null,
  attacks_used int not null default 0,
  attacks_available int not null default 0,
  stars int not null default 0,
  destruction_avg numeric not null default 0,
  three_stars int not null default 0,
  two_stars int not null default 0,
  one_stars int not null default 0,
  zero_stars int not null default 0,
  missed int not null default 0,
  defenses int not null default 0,
  defensive_stars int not null default 0,
  defensive_destruction numeric not null default 0,
  unique (season_clan_id, player_id)
);

create table cron_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  season_key text,
  status text not null,            -- "ok" | "partial" | "error"
  detail jsonb
);

-- Public read-only access; writes happen with the service role key (bypasses RLS).
alter table clans enable row level security;
alter table seasons enable row level security;
alter table players enable row level security;
alter table season_clans enable row level security;
alter table player_season_stats enable row level security;

create policy "public read clans" on clans for select using (true);
create policy "public read seasons" on seasons for select using (true);
create policy "public read players" on players for select using (true);
create policy "public read season_clans" on season_clans for select using (true);
create policy "public read pss" on player_season_stats for select using (true);

insert into clans (tag, name, slot) values
  ('#90YVJJC8', 'Brazilian House 1', 1),
  ('#2JG0ULJQG', 'Brazilian House 2', 2),
  ('#2CPVJ088C', 'Brazilian House 3', 3);
```

- [ ] **Step 2: Apply to Supabase**

In the Supabase dashboard SQL editor, paste and run the migration. (Or `supabase db push` if the CLI is configured.)
Expected: tables created, 3 clans inserted.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: supabase schema + RLS read policies"
```

---

## Task 7: Supabase clients

**Files:**
- Create: `src/lib/db/supabase.ts`

- [ ] **Step 1: Install the SDK**

Run:
```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Implement factories**

`src/lib/db/supabase.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Read-only client for public pages (respects RLS). */
export function publicClient() {
  return createClient(url, anon, { auth: { persistSession: false } });
}

/** Service-role client for writes (bypasses RLS). Server-only. */
export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/db/supabase.ts package.json package-lock.json
git commit -m "feat: supabase client factories"
```

---

## Task 8: Snapshot upsert

**Files:**
- Create: `src/lib/db/snapshots.ts`
- Test: `tests/db/snapshots.test.ts`

This task uses a thin, injectable persistence interface so the aggregation/orchestration logic is testable without a live database.

- [ ] **Step 1: Write the failing test**

`tests/db/snapshots.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildUpsertOps } from "../../src/lib/db/snapshots";
import type { ClanSeasonSnapshot } from "../../src/lib/coc/types";

const snap: ClanSeasonSnapshot = {
  clanTag: "#90YVJJC8",
  totalStars: 5,
  totalAttacks: 2,
  totalDestruction: 95.5,
  players: [
    {
      tag: "#P1", name: "Cesar", townhallLevel: 16, mapPosition: 1,
      attacksUsed: 1, attacksAvailable: 1, stars: 3, destructionAvg: 100,
      threeStars: 1, twoStars: 0, oneStars: 0, zeroStars: 0, missed: 0,
      defenses: 1, defensiveStars: 2, defensiveDestruction: 88,
    },
  ],
};

describe("buildUpsertOps", () => {
  it("produces player rows and a clan-total row", () => {
    const ops = buildUpsertOps("2026-06", snap);
    expect(ops.players[0].tag).toBe("#P1");
    expect(ops.seasonClan.total_stars).toBe(5);
    expect(ops.playerStats[0].stars).toBe(3);
    expect(ops.playerStats[0].townhall_level).toBe(16);
    expect(ops.playerStats[0].defensive_stars).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/db/snapshots.test.ts`
Expected: FAIL — `buildUpsertOps` not defined.

- [ ] **Step 3: Implement build + persist**

`src/lib/db/snapshots.ts`:
```ts
import type { ClanSeasonSnapshot, PlayerSeasonStats } from "../coc/types";
import { serviceClient } from "./supabase";
import { seasonLabel } from "../coc/season";

export interface UpsertOps {
  seasonKey: string;
  seasonClan: { total_stars: number; total_destruction: number; total_attacks: number };
  players: { tag: string; name: string }[];
  playerStats: PlayerStatRow[];
}

export interface PlayerStatRow {
  tag: string; // resolved to player_id at persist time
  townhall_level: number;
  map_position: number;
  attacks_used: number;
  attacks_available: number;
  stars: number;
  destruction_avg: number;
  three_stars: number;
  two_stars: number;
  one_stars: number;
  zero_stars: number;
  missed: number;
  defenses: number;
  defensive_stars: number;
  defensive_destruction: number;
}

function statRow(p: PlayerSeasonStats): PlayerStatRow {
  return {
    tag: p.tag,
    townhall_level: p.townhallLevel,
    map_position: p.mapPosition,
    attacks_used: p.attacksUsed,
    attacks_available: p.attacksAvailable,
    stars: p.stars,
    destruction_avg: p.destructionAvg,
    three_stars: p.threeStars,
    two_stars: p.twoStars,
    one_stars: p.oneStars,
    zero_stars: p.zeroStars,
    missed: p.missed,
    defenses: p.defenses,
    defensive_stars: p.defensiveStars,
    defensive_destruction: p.defensiveDestruction,
  };
}

export function buildUpsertOps(seasonKey: string, snap: ClanSeasonSnapshot): UpsertOps {
  return {
    seasonKey,
    seasonClan: {
      total_stars: snap.totalStars,
      total_destruction: snap.totalDestruction,
      total_attacks: snap.totalAttacks,
    },
    players: snap.players.map((p) => ({ tag: p.tag, name: p.name })),
    playerStats: snap.players.map(statRow),
  };
}

/** Persist one clan's season snapshot. Idempotent (upserts on unique keys). */
export async function persistSnapshot(seasonKey: string, snap: ClanSeasonSnapshot): Promise<void> {
  const db = serviceClient();
  const ops = buildUpsertOps(seasonKey, snap);

  // season
  const { data: season } = await db
    .from("seasons")
    .upsert({ key: seasonKey, label: seasonLabel(seasonKey) }, { onConflict: "key" })
    .select("id")
    .single();

  // clan
  const { data: clan } = await db
    .from("clans")
    .select("id")
    .eq("tag", snap.clanTag)
    .single();
  if (!season || !clan) throw new Error("season or clan row missing");

  // season_clan
  const { data: sc } = await db
    .from("season_clans")
    .upsert(
      { season_id: season.id, clan_id: clan.id, ...ops.seasonClan, fetched_at: new Date().toISOString() },
      { onConflict: "season_id,clan_id" },
    )
    .select("id")
    .single();
  if (!sc) throw new Error("season_clan upsert failed");

  // players (upsert by tag, keep latest name)
  await db.from("players").upsert(ops.players, { onConflict: "tag" });
  const { data: playerRows } = await db
    .from("players")
    .select("id, tag")
    .in("tag", ops.players.map((p) => p.tag));
  const idByTag = new Map((playerRows ?? []).map((r) => [r.tag, r.id]));

  // player_season_stats
  const rows = ops.playerStats.map(({ tag, ...rest }) => ({
    season_clan_id: sc.id,
    player_id: idByTag.get(tag),
    ...rest,
  }));
  await db
    .from("player_season_stats")
    .upsert(rows, { onConflict: "season_clan_id,player_id" });
}
```

- [ ] **Step 4: Run to verify the unit test passes**

Run: `npx vitest run tests/db/snapshots.test.ts`
Expected: PASS (1 test). `persistSnapshot` is exercised end-to-end in Task 9 manual verification, not in unit tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/snapshots.ts tests/db/snapshots.test.ts
git commit -m "feat: snapshot upsert with testable build step"
```

---

## Task 9: Capture orchestration + cron route

**Files:**
- Create: `src/lib/coc/capture.ts`, `src/app/api/cron/route.ts`

- [ ] **Step 1: Implement capture orchestration**

`src/lib/coc/capture.ts`:
```ts
import { getLeagueGroup, getSeasonWars } from "./client";
import { mapSeason } from "./mapper";
import { seasonKey } from "./season";
import { persistSnapshot } from "../db/snapshots";
import { serviceClient } from "../db/supabase";

export interface CaptureResult {
  seasonKey: string;
  perClan: { tag: string; status: "ok" | "no-league" | "error"; message?: string }[];
}

const CLAN_TAGS = [
  process.env.CLAN_1_TAG,
  process.env.CLAN_2_TAG,
  process.env.CLAN_3_TAG,
].filter(Boolean) as string[];

export async function captureAll(now = new Date()): Promise<CaptureResult> {
  const key = seasonKey(now);
  const perClan: CaptureResult["perClan"] = [];

  for (const tag of CLAN_TAGS) {
    try {
      const group = await getLeagueGroup(tag);
      if (!group) {
        perClan.push({ tag, status: "no-league" });
        continue;
      }
      const wars = await getSeasonWars(group);
      const snap = mapSeason(wars, tag);
      await persistSnapshot(group.season ?? key, snap);
      perClan.push({ tag, status: "ok" });
    } catch (e) {
      perClan.push({ tag, status: "error", message: (e as Error).message });
    }
  }

  const anyError = perClan.some((c) => c.status === "error");
  const allOk = perClan.every((c) => c.status === "ok");
  await serviceClient().from("cron_runs").insert({
    season_key: key,
    status: anyError ? (allOk ? "ok" : "partial") : "ok",
    detail: perClan,
  });

  return { seasonKey: key, perClan };
}
```

- [ ] **Step 2: Implement the cron route**

`src/app/api/cron/route.ts`:
```ts
import { NextResponse } from "next/server";
import { captureAll } from "../../../lib/coc/capture";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await captureAll();
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual end-to-end verification (requires real env)**

With `.env.local` populated (CoC token, Supabase keys, clan tags, `CRON_SECRET`), run:
```bash
npm run dev
```
In another shell:
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron
```
Expected: JSON with `perClan` statuses. If a CWL is active, rows appear in `season_clans` / `player_season_stats` (check Supabase). If no CWL, statuses are `no-league` (still a success).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coc/capture.ts src/app/api/cron/route.ts
git commit -m "feat: CWL capture orchestration + cron route"
```

---

## Task 10: Read queries (dashboard + career)

**Files:**
- Create: `src/lib/db/reads.ts`

- [ ] **Step 1: Implement reads**

`src/lib/db/reads.ts`:
```ts
import { publicClient } from "./supabase";

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

export async function listSeasons(): Promise<{ key: string; label: string }[]> {
  const db = publicClient();
  const { data } = await db.from("seasons").select("key,label").order("key", { ascending: false });
  return data ?? [];
}

export async function listClans(): Promise<{ tag: string; name: string; slot: number }[]> {
  const db = publicClient();
  const { data } = await db.from("clans").select("tag,name,slot").order("slot");
  return data ?? [];
}

export async function getDashboard(slot: number, seasonKey: string): Promise<DashboardData | null> {
  const db = publicClient();
  const { data: clan } = await db.from("clans").select("id,tag,name,slot").eq("slot", slot).single();
  const { data: season } = await db.from("seasons").select("id,key,label").eq("key", seasonKey).single();
  if (!clan || !season) return null;

  const { data: sc } = await db
    .from("season_clans")
    .select("id,rank,total_stars,total_destruction,total_attacks")
    .eq("clan_id", clan.id)
    .eq("season_id", season.id)
    .single();
  if (!sc) return null;

  const { data: players } = await db
    .from("player_season_stats")
    .select(
      "townhall_level,map_position,attacks_used,attacks_available,stars,destruction_avg,defenses,defensive_stars,players(tag,name)",
    )
    .eq("season_clan_id", sc.id)
    .order("map_position");

  const rows: PlayerRow[] = (players ?? []).map((r: any) => ({
    tag: r.players.tag,
    name: r.players.name,
    townhall_level: r.townhall_level,
    map_position: r.map_position,
    attacks_used: r.attacks_used,
    attacks_available: r.attacks_available,
    stars: r.stars,
    destruction_avg: r.destruction_avg,
    defenses: r.defenses,
    defensive_stars: r.defensive_stars,
  }));

  return {
    clan: { tag: clan.tag, name: clan.name, slot: clan.slot },
    season: { key: season.key, label: season.label },
    totals: {
      total_stars: sc.total_stars,
      total_destruction: sc.total_destruction,
      total_attacks: sc.total_attacks,
      rank: sc.rank,
    },
    players: rows,
  };
}

export interface CareerData {
  player: { tag: string; name: string };
  totals: { seasons: number; stars: number; attacks: number; avgStars: number; avgDestruction: number };
  history: { seasonKey: string; clanName: string; townhall_level: number; stars: number; destruction_avg: number; defensive_stars: number }[];
}

export async function getCareer(tag: string): Promise<CareerData | null> {
  const db = publicClient();
  const decoded = tag.startsWith("#") ? tag : `#${tag}`;
  const { data: player } = await db.from("players").select("id,tag,name").eq("tag", decoded).single();
  if (!player) return null;

  const { data: stats } = await db
    .from("player_season_stats")
    .select(
      "stars,attacks_used,destruction_avg,defensive_stars,townhall_level,season_clans(seasons(key),clans(name))",
    )
    .eq("player_id", player.id);

  const history = (stats ?? []).map((r: any) => ({
    seasonKey: r.season_clans.seasons.key,
    clanName: r.season_clans.clans.name,
    townhall_level: r.townhall_level,
    stars: r.stars,
    destruction_avg: r.destruction_avg,
    defensive_stars: r.defensive_stars,
  }));
  history.sort((a, b) => b.seasonKey.localeCompare(a.seasonKey));

  const seasons = history.length;
  const stars = history.reduce((s, h) => s + h.stars, 0);
  const attacks = (stats ?? []).reduce((s: number, r: any) => s + r.attacks_used, 0);
  const destSum = history.reduce((s, h) => s + h.destruction_avg, 0);

  return {
    player: { tag: player.tag, name: player.name },
    totals: {
      seasons,
      stars,
      attacks,
      avgStars: attacks > 0 ? Math.round((stars / attacks) * 100) / 100 : 0,
      avgDestruction: seasons > 0 ? Math.round((destSum / seasons) * 100) / 100 : 0,
    },
    history,
  };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/db/reads.ts
git commit -m "feat: dashboard + career read queries"
```

---

## Task 11: Theme + shared UI components

**Files:**
- Modify: `src/app/globals.css`, `tailwind.config.ts`
- Create: `src/components/SummaryCards.tsx`, `src/components/PlayerTable.tsx`, `src/components/ClanTabs.tsx`, `src/components/SeasonSelect.tsx`

- [ ] **Step 1: Add the dark Clash palette to `tailwind.config.ts`**

In `theme.extend.colors` add:
```ts
colors: {
  clash: {
    bg: "#1b1530",
    card: "#2a2046",
    border: "#4a3a72",
    gold: "#e0a020",
    text: "#e8e0ff",
    muted: "#9a8ac0",
  },
},
```

- [ ] **Step 2: Set base background in `globals.css`**

Append:
```css
body { background: #1b1530; color: #e8e0ff; }
```

- [ ] **Step 3: SummaryCards**

`src/components/SummaryCards.tsx`:
```tsx
export function SummaryCards({
  totals,
}: {
  totals: { total_stars: number; total_destruction: number; total_attacks: number; rank: number | null };
}) {
  const cards = [
    { big: totals.total_stars, lbl: "Estrelas" },
    { big: `${totals.total_destruction}%`, lbl: "Destruição" },
    { big: totals.total_attacks, lbl: "Ataques" },
    { big: totals.rank ? `${totals.rank}º` : "—", lbl: "Ranking" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {cards.map((c) => (
        <div key={c.lbl} className="bg-clash-card border border-clash-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-clash-gold">{c.big}</div>
          <div className="text-xs uppercase tracking-wide text-clash-muted">{c.lbl}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: PlayerTable**

`src/components/PlayerTable.tsx`:
```tsx
import Link from "next/link";
import type { PlayerRow } from "../lib/db/reads";

export function PlayerTable({ players }: { players: PlayerRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-clash-muted text-xs uppercase">
          <th className="text-left p-2 border-b border-clash-border">Jogador</th>
          <th className="p-2 border-b border-clash-border">CV</th>
          <th className="p-2 border-b border-clash-border">Atq</th>
          <th className="p-2 border-b border-clash-border">★</th>
          <th className="p-2 border-b border-clash-border">Dest%</th>
          <th className="p-2 border-b border-clash-border">Def ★</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.tag} className="border-b border-clash-card">
            <td className="p-2">
              <Link className="hover:text-clash-gold" href={`/player/${encodeURIComponent(p.tag)}`}>
                {p.name}
              </Link>
            </td>
            <td className="p-2 text-center">
              <span className="inline-block min-w-[24px] bg-clash-border rounded px-1.5 font-bold">{p.townhall_level}</span>
            </td>
            <td className="p-2 text-center">{p.attacks_used}/{p.attacks_available}</td>
            <td className="p-2 text-center text-clash-gold">{p.stars}★</td>
            <td className="p-2 text-center">{p.destruction_avg}%</td>
            <td className="p-2 text-center">{p.defensive_stars}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: ClanTabs + SeasonSelect**

`src/components/ClanTabs.tsx`:
```tsx
import Link from "next/link";

export function ClanTabs({
  clans,
  activeSlot,
  seasonKey,
}: {
  clans: { tag: string; name: string; slot: number }[];
  activeSlot: number;
  seasonKey: string;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {clans.map((c) => (
        <Link
          key={c.slot}
          href={`/dashboard/${c.slot}/${seasonKey}`}
          className={`px-3 py-1.5 rounded-md border ${
            c.slot === activeSlot
              ? "bg-clash-gold text-clash-bg border-clash-gold font-bold"
              : "bg-clash-card border-clash-border text-clash-text"
          }`}
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}
```

`src/components/SeasonSelect.tsx`:
```tsx
"use client";
import { useRouter } from "next/navigation";

export function SeasonSelect({
  seasons,
  activeKey,
  slot,
}: {
  seasons: { key: string; label: string }[];
  activeKey: string;
  slot: number;
}) {
  const router = useRouter();
  return (
    <select
      value={activeKey}
      onChange={(e) => router.push(`/dashboard/${slot}/${e.target.value}`)}
      className="ml-auto px-2.5 py-1.5 rounded-md bg-clash-card border border-clash-border text-clash-text"
    >
      {seasons.map((s) => (
        <option key={s.key} value={s.key}>{s.label}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components tailwind.config.ts src/app/globals.css
git commit -m "feat: dark Clash theme + dashboard UI components"
```

---

## Task 12: Public pages (home, dashboard, career)

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/dashboard/[clan]/[season]/page.tsx`, `src/app/player/[tag]/page.tsx`

- [ ] **Step 1: Home redirects to latest dashboard**

`src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { listSeasons, listClans } from "../lib/db/reads";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [seasons, clans] = await Promise.all([listSeasons(), listClans()]);
  if (seasons.length === 0 || clans.length === 0) {
    return <main className="p-8"><p className="text-clash-muted">Sem dados ainda. Aguarde a próxima Liga.</p></main>;
  }
  redirect(`/dashboard/${clans[0].slot}/${seasons[0].key}`);
}
```

- [ ] **Step 2: Dashboard page**

`src/app/dashboard/[clan]/[season]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getDashboard, listSeasons, listClans } from "../../../../lib/db/reads";
import { SummaryCards } from "../../../../components/SummaryCards";
import { PlayerTable } from "../../../../components/PlayerTable";
import { ClanTabs } from "../../../../components/ClanTabs";
import { SeasonSelect } from "../../../../components/SeasonSelect";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ clan: string; season: string }>;
}) {
  const { clan, season } = await params;
  const slot = Number(clan);
  const [data, seasons, clans] = await Promise.all([
    getDashboard(slot, season),
    listSeasons(),
    listClans(),
  ]);
  if (!data) notFound();

  return (
    <main className="max-w-3xl mx-auto p-4">
      <div className="flex gap-2 items-center flex-wrap mb-4">
        <ClanTabs clans={clans} activeSlot={slot} seasonKey={season} />
        <SeasonSelect seasons={seasons} activeKey={season} slot={slot} />
      </div>
      <SummaryCards totals={data.totals} />
      <div className="bg-clash-card border border-clash-border rounded-lg p-3">
        <PlayerTable players={data.players} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Career page**

`src/app/player/[tag]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCareer } from "../../../lib/db/reads";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const data = await getCareer(decodeURIComponent(tag));
  if (!data) notFound();

  return (
    <main className="max-w-2xl mx-auto p-4">
      <Link href="/" className="text-clash-muted hover:text-clash-gold text-sm">&larr; Voltar</Link>
      <h1 className="text-xl font-bold text-clash-gold mt-2">{data.player.name}</h1>
      <p className="text-clash-muted text-xs mb-4">{data.player.tag}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat big={data.totals.seasons} lbl="Ligas" />
        <Stat big={data.totals.stars} lbl="Total ★" />
        <Stat big={data.totals.avgStars} lbl="Média ★/atq" />
        <Stat big={`${data.totals.avgDestruction}%`} lbl="Média Dest" />
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-clash-muted text-xs uppercase">
            <th className="text-left p-2 border-b border-clash-border">Liga</th>
            <th className="p-2 border-b border-clash-border">Clã</th>
            <th className="p-2 border-b border-clash-border">CV</th>
            <th className="p-2 border-b border-clash-border">★</th>
            <th className="p-2 border-b border-clash-border">Dest%</th>
            <th className="p-2 border-b border-clash-border">Def ★</th>
          </tr>
        </thead>
        <tbody>
          {data.history.map((h) => (
            <tr key={h.seasonKey + h.clanName} className="border-b border-clash-card">
              <td className="p-2">{h.seasonKey}</td>
              <td className="p-2">{h.clanName}</td>
              <td className="p-2 text-center">{h.townhall_level}</td>
              <td className="p-2 text-center text-clash-gold">{h.stars}★</td>
              <td className="p-2 text-center">{h.destruction_avg}%</td>
              <td className="p-2 text-center">{h.defensive_stars}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function Stat({ big, lbl }: { big: React.ReactNode; lbl: string }) {
  return (
    <div className="bg-clash-card border border-clash-border rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-clash-gold">{big}</div>
      <div className="text-xs uppercase tracking-wide text-clash-muted">{lbl}</div>
    </div>
  );
}
```

- [ ] **Step 4: Build verification**

Run: `npm run build`
Expected: builds with no type errors. Pages render (data may be empty until first capture).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx "src/app/dashboard" "src/app/player"
git commit -m "feat: public home, dashboard, and career pages"
```

---

## Task 13: Admin auth + force refresh + status

**Files:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/actions.ts`, `src/lib/db/runs.ts`, `src/middleware.ts`

- [ ] **Step 1: Read last run helper**

`src/lib/db/runs.ts`:
```ts
import { publicClient } from "./supabase";

export interface CronRun {
  ran_at: string;
  season_key: string | null;
  status: string;
  detail: { tag: string; status: string; message?: string }[] | null;
}

export async function lastRuns(limit = 5): Promise<CronRun[]> {
  const db = publicClient();
  const { data } = await db
    .from("cron_runs")
    .select("ran_at,season_key,status,detail")
    .order("ran_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CronRun[];
}
```

- [ ] **Step 2: Auth middleware (Supabase) protecting `/admin`**

Run: `npm install @supabase/ssr`

`src/middleware.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();

  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => cookies.forEach((c) => res.cookies.set(c.name, c.value, c.options)),
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user && req.nextUrl.pathname !== "/admin/login") {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return res;
}

export const config = { matcher: ["/admin/:path*"] };
```

> Create the admin user once in the Supabase Auth dashboard (email + password). Login page (`/admin/login`) uses `supabase.auth.signInWithPassword`. A minimal email/password form is sufficient; no public sign-up.

- [ ] **Step 3: Force-refresh server action**

`src/app/admin/actions.ts`:
```ts
"use server";
import { captureAll } from "../../lib/coc/capture";

export async function forceRefresh() {
  return captureAll();
}
```

- [ ] **Step 4: Admin page**

`src/app/admin/page.tsx`:
```tsx
import { lastRuns } from "../../lib/db/runs";
import { forceRefresh } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const runs = await lastRuns();
  return (
    <main className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-bold text-clash-gold mb-4">Admin</h1>
      <form action={forceRefresh}>
        <button className="bg-clash-gold text-clash-bg font-bold px-4 py-2 rounded-md mb-6">
          Forçar atualização agora
        </button>
      </form>
      <h2 className="text-clash-muted uppercase text-xs mb-2">Últimos runs</h2>
      <ul className="space-y-2">
        {runs.map((r, i) => (
          <li key={i} className="bg-clash-card border border-clash-border rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span>{new Date(r.ran_at).toLocaleString("pt-BR")}</span>
              <span className="text-clash-gold">{r.status}</span>
            </div>
            <div className="text-clash-muted text-xs mt-1">
              {(r.detail ?? []).map((d) => `${d.tag}: ${d.status}`).join("  ·  ")}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: Typecheck + build + commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/admin src/lib/db/runs.ts src/middleware.ts package.json package-lock.json
git commit -m "feat: admin page with force-refresh and run status"
```

---

## Task 14: Vercel cron + deploy config

**Files:**
- Create: `vercel.json`
- Create: `README.md`

- [ ] **Step 1: Cron config**

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron", "schedule": "0 9 1-12 * *" }
  ]
}
```
> Runs daily at 09:00 UTC on days 1–12. Vercel automatically sends
> `Authorization: Bearer $CRON_SECRET` to cron paths when `CRON_SECRET` is set
> as an environment variable, matching the route's auth check.

- [ ] **Step 2: README with setup steps**

`README.md` — document: required env vars (from `.env.example`), Supabase migration step, RoyaleAPI proxy token whitelist (proxy IP `45.79.218.79`), creating the admin user, and `vercel env` setup. Include the exact env var names from `.env.example`.

- [ ] **Step 3: Commit**

```bash
git add vercel.json README.md
git commit -m "chore: vercel cron schedule + setup README"
```

- [ ] **Step 4: Deploy verification**

Push to GitHub; import the repo in Vercel; set env vars; deploy. Confirm:
- Site loads (empty state OK pre-capture).
- `/admin` redirects to login when logged out.
- Manually trigger the cron path (Vercel dashboard → Cron → Run) and confirm a `cron_runs` row appears.

---

## Self-Review Notes

- **Spec coverage:** data model (Task 6), mapper attack/defense/CV (Task 3), client+proxy (Task 5), automatic daily cron days 1–12 (Tasks 9, 14), admin backup + status (Task 13), dashboard option B + career (Tasks 11–12), testing with PDF-derived fixtures (Task 3). All spec sections mapped.
- **Out of scope honored:** no attack-by-attack table, no clan-4 data (schema supports `slot`), no cross-season clan view.
- **Type consistency:** `PlayerSeasonStats`/`ClanSeasonSnapshot` (Task 2) flow into mapper (Task 3), snapshots (Task 8), capture (Task 9); `PlayerRow`/`DashboardData`/`CareerData` (Task 10) flow into components/pages (Tasks 11–12). `captureAll` defined in Task 9 reused in Task 13.
- **Open items:** verify the 3 clan tags on first real fetch (O vs 0); confirm RoyaleAPI proxy IP `45.79.218.79` is current when whitelisting the token.
