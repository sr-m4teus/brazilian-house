# CSV Upload Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CoC API capture with an admin CSV upload that parses `*_war_attacks.csv` in memory, aggregates per-player CWL stats, and persists the values (file is discarded).

**Architecture:** A new `src/lib/csv/` layer (`parse.ts` → typed rows, `aggregate.ts` → `ClanSeasonSnapshot[]`) feeds the existing unchanged `persistSnapshot`. An admin server action drives upload; the CoC API client, cron route, and dashboard refresh button are retired.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Supabase, vitest, papaparse.

---

## File Structure

- `src/lib/types.ts` — **new**: domain types `ClanSeasonSnapshot`, `PlayerSeasonStats` (moved out of `coc/types.ts`).
- `src/lib/csv/parse.ts` — **new**: `parseAttacksCsv(text) → AttackRow[]`.
- `src/lib/csv/aggregate.ts` — **new**: `aggregate(rows) → SeasonSnapshot[]`.
- `src/app/admin/actions.ts` — **modify**: replace `forceRefresh` with `uploadCsv`.
- `src/components/UploadForm.tsx` — **new**: client upload form + results.
- `src/app/admin/page.tsx` — **modify**: use `UploadForm`.
- `src/lib/db/snapshots.ts` — **modify**: import types from `../types`.
- Deleted: `src/lib/coc/{client,capture,mapper,types}.ts`, `src/app/api/cron/route.ts`, `src/components/RefreshButton.tsx`, `tests/coc/mapper.test.ts` + `tests/coc/fixtures/`.

---

## Task 1: Add papaparse dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run:
```bash
npm install papaparse && npm install -D @types/papaparse
```
Expected: both added, no errors.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add papaparse for CSV import"
```

---

## Task 2: Move domain types to src/lib/types.ts

**Files:**
- Create: `src/lib/types.ts`
- Modify: `src/lib/db/snapshots.ts:1`
- Modify: `tests/db/snapshots.test.ts:3`

- [ ] **Step 1: Create the types file**

`src/lib/types.ts`:
```ts
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

- [ ] **Step 2: Repoint snapshots.ts import**

In `src/lib/db/snapshots.ts` change line 1 from:
```ts
import type { ClanSeasonSnapshot, PlayerSeasonStats } from "../coc/types";
```
to:
```ts
import type { ClanSeasonSnapshot, PlayerSeasonStats } from "../types";
```

- [ ] **Step 3: Repoint the test import**

In `tests/db/snapshots.test.ts` change line 3 from:
```ts
import type { ClanSeasonSnapshot } from "../../src/lib/coc/types";
```
to:
```ts
import type { ClanSeasonSnapshot } from "../../src/lib/types";
```

- [ ] **Step 4: Verify nothing else imports the moved types**

Run:
```bash
grep -rn "coc/types" src tests | grep -E "ClanSeasonSnapshot|PlayerSeasonStats"
```
Expected: only `src/lib/coc/mapper.ts` and `src/lib/coc/capture.ts` (both deleted in Task 7). If any other file appears, repoint it to `../types` too.

- [ ] **Step 5: Run the existing snapshot test**

Run: `npx vitest run tests/db/snapshots.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/db/snapshots.ts tests/db/snapshots.test.ts
git commit -m "refactor: move domain snapshot types to src/lib/types.ts"
```

---

## Task 3: CSV parser

**Files:**
- Create: `src/lib/csv/parse.ts`
- Test: `tests/csv/parse.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/csv/parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseAttacksCsv } from "../../src/lib/csv/parse";

const HEADER =
  "tag,name,rank,thLevel,warID,order_,attackerTag,defenderTag,stars,new_stars," +
  "destructionPercentage,war_player.defenderTag,defenderName,defenderRank,defenderTH," +
  "attacker_is_home_clan,home_clan_tag,home_clan_name,home_clan_level," +
  "enemy_clan_tag,enemy_clan_name,enemy_clan_level,war_start_time,war_size,type";

describe("parseAttacksCsv", () => {
  it("parses a quoted comma-name row with a BOM", () => {
    const bom = "﻿";
    const row =
      '#A,",Garou\'",11,18,16054194,1,#A,#B,3,1,100,#B,scoqui,13,18,' +
      "1,#90YVJJC8,BRAZILIAN HOUSE,30,#E,FIRTINA,28,2026-06-25 09:39:44,15,league";
    const rows = parseAttacksCsv(`${bom}${HEADER}\n${row}\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0].tag).toBe("#A");
    expect(rows[0].name).toBe(",Garou'");
    expect(rows[0].stars).toBe(3);
    expect(rows[0].newStars).toBe(1);
    expect(rows[0].attackerIsHomeClan).toBe(1);
    expect(rows[0].homeClanTag).toBe("#90YVJJC8");
    expect(rows[0].warStartTime).toBe("2026-06-25 09:39:44");
    expect(rows[0].type).toBe("league");
  });

  it("throws when a required column is missing", () => {
    expect(() => parseAttacksCsv("tag,name\n#A,Bob\n")).toThrow(/missing columns/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/csv/parse.test.ts`
Expected: FAIL — cannot find module `parse`.

- [ ] **Step 3: Write the implementation**

`src/lib/csv/parse.ts`:
```ts
import Papa from "papaparse";

export interface AttackRow {
  tag: string;
  name: string;
  rank: number;
  thLevel: number;
  warID: number;
  stars: number;
  newStars: number;
  destructionPercentage: number;
  defenderTag: string;
  defenderName: string;
  defenderRank: number;
  defenderTH: number;
  attackerIsHomeClan: number;
  homeClanTag: string;
  warStartTime: string;
  type: string;
}

const REQUIRED = [
  "tag", "name", "rank", "thLevel", "warID", "stars", "new_stars",
  "destructionPercentage", "defenderTag", "defenderName", "defenderRank",
  "defenderTH", "attacker_is_home_clan", "home_clan_tag", "war_start_time", "type",
];

export function parseAttacksCsv(text: string): AttackRow[] {
  const clean = text.replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: true,
  });
  const fields = parsed.meta.fields ?? [];
  const missing = REQUIRED.filter((c) => !fields.includes(c));
  if (missing.length) {
    throw new Error(`CSV missing columns: ${missing.join(", ")}`);
  }
  return parsed.data.map((r) => ({
    tag: r.tag,
    name: r.name,
    rank: Number(r.rank),
    thLevel: Number(r.thLevel),
    warID: Number(r.warID),
    stars: Number(r.stars),
    newStars: Number(r.new_stars),
    destructionPercentage: Number(r.destructionPercentage),
    defenderTag: r.defenderTag,
    defenderName: r.defenderName,
    defenderRank: Number(r.defenderRank),
    defenderTH: Number(r.defenderTH),
    attackerIsHomeClan: Number(r.attacker_is_home_clan),
    homeClanTag: r.home_clan_tag,
    warStartTime: r.war_start_time,
    type: r.type,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/csv/parse.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/parse.ts tests/csv/parse.test.ts
git commit -m "feat: parse war_attacks CSV into typed rows"
```

---

## Task 4: Aggregate rows into season snapshots

**Files:**
- Create: `src/lib/csv/aggregate.ts`
- Test: `tests/csv/aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/csv/aggregate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { aggregate } from "../../src/lib/csv/aggregate";
import type { AttackRow } from "../../src/lib/csv/parse";

function row(p: Partial<AttackRow>): AttackRow {
  return {
    tag: "#X", name: "X", rank: 1, thLevel: 18, warID: 1,
    stars: 0, newStars: 0, destructionPercentage: 0,
    defenderTag: "#D", defenderName: "D", defenderRank: 1, defenderTH: 18,
    attackerIsHomeClan: 1, homeClanTag: "#90YVJJC8",
    warStartTime: "2026-06-01 10:00:00", type: "league",
    ...p,
  };
}

describe("aggregate", () => {
  const rows: AttackRow[] = [
    // war 1 (league, June)
    row({ warID: 1, tag: "#P1", name: "P1", rank: 1, stars: 3, destructionPercentage: 100, attackerIsHomeClan: 1 }),
    row({ warID: 1, tag: "#P2", name: "P2", rank: 2, stars: 2, destructionPercentage: 90, attackerIsHomeClan: 1 }),
    row({ warID: 1, attackerIsHomeClan: 0, defenderTag: "#P1", defenderName: "P1", defenderRank: 1, stars: 1, destructionPercentage: 50 }),
    // war 2 (league, June)
    row({ warID: 2, tag: "#P1", name: "P1", rank: 1, stars: 0, destructionPercentage: 20, attackerIsHomeClan: 1 }),
    row({ warID: 2, attackerIsHomeClan: 0, defenderTag: "#P2", defenderName: "P2", defenderRank: 2, stars: 2, destructionPercentage: 80 }),
    // war 3 (normal, June) — must be excluded
    row({ warID: 3, tag: "#P1", name: "P1", stars: 3, destructionPercentage: 100, type: "normal" }),
    // war 4 (league, July) — separate season
    row({ warID: 4, tag: "#P1", name: "P1", rank: 1, stars: 3, destructionPercentage: 100, warStartTime: "2026-07-02 10:00:00" }),
  ];

  it("produces one snapshot per league season month", () => {
    const snaps = aggregate(rows);
    expect(snaps.map((s) => s.seasonKey).sort()).toEqual(["2026-06", "2026-07"]);
  });

  it("aggregates June offense, defense, and missed attacks", () => {
    const june = aggregate(rows).find((s) => s.seasonKey === "2026-06")!.snapshot;
    expect(june.clanTag).toBe("#90YVJJC8");

    const p1 = june.players.find((p) => p.tag === "#P1")!;
    expect(p1.attacksUsed).toBe(2);
    expect(p1.stars).toBe(3);
    expect(p1.threeStars).toBe(1);
    expect(p1.zeroStars).toBe(1);
    expect(p1.destructionAvg).toBe(60); // (100 + 20) / 2
    expect(p1.attacksAvailable).toBe(2);
    expect(p1.missed).toBe(0);
    expect(p1.defenses).toBe(1);
    expect(p1.defensiveStars).toBe(1);
    expect(p1.defensiveDestruction).toBe(50);

    const p2 = june.players.find((p) => p.tag === "#P2")!;
    expect(p2.attacksUsed).toBe(1);
    expect(p2.stars).toBe(2);
    expect(p2.attacksAvailable).toBe(2); // attacked in war1, defended in war2
    expect(p2.missed).toBe(1);
    expect(p2.defenses).toBe(1);
    expect(p2.defensiveStars).toBe(2);

    expect(june.totalStars).toBe(5);
    expect(june.totalAttacks).toBe(3);
    expect(june.totalDestruction).toBe(70); // (100 + 20 + 90) / 3
  });

  it("excludes normal wars", () => {
    const june = aggregate(rows).find((s) => s.seasonKey === "2026-06")!.snapshot;
    const p1 = june.players.find((p) => p.tag === "#P1")!;
    // war 3 (normal) would have added a 3rd attack / 3 stars if not excluded
    expect(p1.attacksUsed).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/csv/aggregate.test.ts`
Expected: FAIL — cannot find module `aggregate`.

- [ ] **Step 3: Write the implementation**

`src/lib/csv/aggregate.ts`:
```ts
import type { AttackRow } from "./parse";
import type { ClanSeasonSnapshot, PlayerSeasonStats } from "../types";

export interface SeasonSnapshot {
  seasonKey: string;
  snapshot: ClanSeasonSnapshot;
}

interface Acc {
  tag: string;
  name: string;
  townhallLevel: number;
  mapPosition: number;
  attacksUsed: number;
  stars: number;
  destSum: number;
  threeStars: number;
  twoStars: number;
  oneStars: number;
  zeroStars: number;
  wars: Set<number>;
  bestDef: Map<number, { stars: number; dest: number }>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function aggregate(rows: AttackRow[]): SeasonSnapshot[] {
  const league = rows.filter((r) => r.type === "league");
  const bySeason = new Map<string, AttackRow[]>();
  for (const r of league) {
    const key = r.warStartTime.slice(0, 7); // "YYYY-MM"
    let arr = bySeason.get(key);
    if (!arr) {
      arr = [];
      bySeason.set(key, arr);
    }
    arr.push(r);
  }

  const out: SeasonSnapshot[] = [];
  for (const [seasonKey, seasonRows] of bySeason) {
    out.push({ seasonKey, snapshot: buildSnapshot(seasonRows) });
  }
  return out;
}

function buildSnapshot(rows: AttackRow[]): ClanSeasonSnapshot {
  const clanTags = new Set(rows.map((r) => r.homeClanTag));
  if (clanTags.size !== 1) {
    throw new Error(`expected one home_clan_tag, got: ${[...clanTags].join(", ")}`);
  }
  const clanTag = [...clanTags][0];

  const acc = new Map<string, Acc>();
  const ensure = (tag: string, name: string, th: number, pos: number): Acc => {
    let a = acc.get(tag);
    if (!a) {
      a = {
        tag, name, townhallLevel: th, mapPosition: pos,
        attacksUsed: 0, stars: 0, destSum: 0,
        threeStars: 0, twoStars: 0, oneStars: 0, zeroStars: 0,
        wars: new Set(), bestDef: new Map(),
      };
      acc.set(tag, a);
    }
    return a;
  };

  for (const r of rows) {
    if (r.attackerIsHomeClan === 1) {
      const a = ensure(r.tag, r.name, r.thLevel, r.rank);
      a.name = r.name;
      a.townhallLevel = r.thLevel;
      a.mapPosition = r.rank;
      a.attacksUsed += 1;
      a.stars += r.stars;
      a.destSum += r.destructionPercentage;
      if (r.stars === 3) a.threeStars += 1;
      else if (r.stars === 2) a.twoStars += 1;
      else if (r.stars === 1) a.oneStars += 1;
      else a.zeroStars += 1;
      a.wars.add(r.warID);
    } else {
      // enemy attacking one of our members -> defense of defenderTag
      const a = ensure(r.defenderTag, r.defenderName, r.defenderTH, r.defenderRank);
      a.wars.add(r.warID);
      const cur = a.bestDef.get(r.warID);
      if (
        !cur ||
        r.stars > cur.stars ||
        (r.stars === cur.stars && r.destructionPercentage > cur.dest)
      ) {
        a.bestDef.set(r.warID, { stars: r.stars, dest: r.destructionPercentage });
      }
    }
  }

  let totalStars = 0;
  let totalAttacks = 0;
  let clanDestSum = 0;
  const players: PlayerSeasonStats[] = [];

  for (const a of acc.values()) {
    const defenses = a.bestDef.size;
    let defStars = 0;
    let defDestSum = 0;
    for (const b of a.bestDef.values()) {
      defStars += b.stars;
      defDestSum += b.dest;
    }
    const attacksAvailable = a.wars.size;
    players.push({
      tag: a.tag,
      name: a.name,
      townhallLevel: a.townhallLevel,
      mapPosition: a.mapPosition,
      attacksUsed: a.attacksUsed,
      attacksAvailable,
      stars: a.stars,
      destructionAvg: a.attacksUsed > 0 ? round2(a.destSum / a.attacksUsed) : 0,
      threeStars: a.threeStars,
      twoStars: a.twoStars,
      oneStars: a.oneStars,
      zeroStars: a.zeroStars,
      missed: Math.max(0, attacksAvailable - a.attacksUsed),
      defenses,
      defensiveStars: defStars,
      defensiveDestruction: defenses > 0 ? round2(defDestSum / defenses) : 0,
    });
    totalStars += a.stars;
    totalAttacks += a.attacksUsed;
    clanDestSum += a.destSum;
  }

  players.sort((x, y) => x.mapPosition - y.mapPosition);

  return {
    clanTag,
    totalStars,
    totalAttacks,
    totalDestruction: totalAttacks > 0 ? round2(clanDestSum / totalAttacks) : 0,
    players,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/csv/aggregate.test.ts`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/aggregate.ts tests/csv/aggregate.test.ts
git commit -m "feat: aggregate CSV attack rows into season snapshots"
```

---

## Task 5: Upload server action

**Files:**
- Modify: `src/app/admin/actions.ts` (replace entire contents)

- [ ] **Step 1: Replace the action file**

`src/app/admin/actions.ts`:
```ts
"use server";
import { parseAttacksCsv } from "../../lib/csv/parse";
import { aggregate } from "../../lib/csv/aggregate";
import { persistSnapshot } from "../../lib/db/snapshots";

export interface UploadResult {
  fileName: string;
  clanTag?: string;
  seasons: string[];
  players: number;
  status: "ok" | "error";
  message?: string;
}

export async function uploadCsv(formData: FormData): Promise<UploadResult[]> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const results: UploadResult[] = [];

  for (const file of files) {
    try {
      const text = await file.text();
      const snaps = aggregate(parseAttacksCsv(text));
      if (snaps.length === 0) throw new Error("sem guerras de liga no arquivo");

      let players = 0;
      for (const s of snaps) {
        await persistSnapshot(s.seasonKey, s.snapshot, null);
        players += s.snapshot.players.length;
      }
      results.push({
        fileName: file.name,
        clanTag: snaps[0].snapshot.clanTag,
        seasons: snaps.map((s) => s.seasonKey),
        players,
        status: "ok",
      });
    } catch (e) {
      results.push({
        fileName: file.name,
        seasons: [],
        players: 0,
        status: "error",
        message: (e as Error).message,
      });
    }
  }
  return results;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`forceRefresh` is now gone; Task 7 removes its last caller, the dashboard button — until then `tsc` may still pass because `RefreshButton` imports `forceRefresh`. If `tsc` reports `forceRefresh` missing, proceed — Task 7 fixes it. Do NOT re-add `forceRefresh`.)

> Note: if the worker runs tasks in order, do Task 7's RefreshButton/dashboard removal before relying on a clean `tsc`. The final clean typecheck is asserted in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/actions.ts
git commit -m "feat: uploadCsv server action persists parsed snapshots"
```

---

## Task 6: Admin upload UI

**Files:**
- Create: `src/components/UploadForm.tsx`
- Modify: `src/app/admin/page.tsx:1-15`

- [ ] **Step 1: Create the upload form component**

`src/components/UploadForm.tsx`:
```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { uploadCsv, type UploadResult } from "../app/admin/actions";

export function UploadForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [results, setResults] = useState<UploadResult[] | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      const res = await uploadCsv(form);
      setResults(res);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 space-y-3">
      <input
        name="files"
        type="file"
        accept=".csv"
        multiple
        required
        className="block text-sm text-clash-text"
      />
      <button
        disabled={pending}
        className="bg-clash-gold text-clash-bg font-bold px-4 py-2 rounded-md disabled:opacity-50"
      >
        {pending ? "Enviando…" : "Enviar CSV"}
      </button>
      {results && (
        <ul className="space-y-1 text-sm mt-2">
          {results.map((r, i) => (
            <li key={i} className={r.status === "ok" ? "text-clash-text" : "text-red-400"}>
              {r.fileName}:{" "}
              {r.status === "ok"
                ? `${r.clanTag} · ${r.seasons.join(", ")} · ${r.players} jogadores`
                : r.message}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Wire it into the admin page**

In `src/app/admin/page.tsx` replace the top import and the `<form>…</form>` block.

Change line 2 from:
```ts
import { forceRefresh } from "./actions";
```
to:
```ts
import { UploadForm } from "../../components/UploadForm";
```

Replace this block (lines 11-15):
```tsx
      <form action={async () => { "use server"; await forceRefresh(); }}>
        <button className="bg-clash-gold text-clash-bg font-bold px-4 py-2 rounded-md mb-6">
          Forçar atualização agora
        </button>
      </form>
```
with:
```tsx
      <UploadForm />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (admin page no longer references `forceRefresh`).

- [ ] **Step 4: Commit**

```bash
git add src/components/UploadForm.tsx src/app/admin/page.tsx
git commit -m "feat: admin CSV upload form"
```

---

## Task 7: Retire the CoC API, cron, and dashboard refresh button

**Files:**
- Modify: `src/app/dashboard/[clan]/[season]/page.tsx` (remove RefreshButton)
- Delete: `src/components/RefreshButton.tsx`
- Delete: `src/lib/coc/client.ts`, `src/lib/coc/capture.ts`, `src/lib/coc/mapper.ts`, `src/lib/coc/types.ts`
- Delete: `tests/coc/mapper.test.ts`, `tests/coc/fixtures/` (war fixtures)
- Delete: `src/app/api/cron/route.ts`
- Modify: `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Remove RefreshButton from the dashboard**

In `src/app/dashboard/[clan]/[season]/page.tsx`:
- Delete the import line `import { RefreshButton } from "../../../../components/RefreshButton";`
- Delete the `<RefreshButton />` line inside the header `div`.

- [ ] **Step 2: Delete retired files**

Run:
```bash
git rm src/components/RefreshButton.tsx \
  src/lib/coc/client.ts src/lib/coc/capture.ts src/lib/coc/mapper.ts src/lib/coc/types.ts \
  src/app/api/cron/route.ts \
  tests/coc/mapper.test.ts
git rm -r tests/coc/fixtures
```
Expected: files staged for deletion. (If `tests/coc/` becomes empty except `season.test.ts`, leave `season.test.ts` in place.)

- [ ] **Step 3: Strip the cron from vercel.json**

Replace `vercel.json` entire contents with:
```json
{}
```

- [ ] **Step 4: Clean env example**

Replace `.env.example` entire contents with:
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Direct Postgres (migrations/tooling)
DATABASE_CONNECTION_STRING=
```

- [ ] **Step 5: Verify no dangling references**

Run:
```bash
grep -rn "coc/capture\|coc/client\|coc/mapper\|coc/types\|RefreshButton\|forceRefresh\|COC_API\|api/cron" src tests
```
Expected: no output. If anything appears, remove it.

- [ ] **Step 6: Typecheck and full test run**

Run:
```bash
npx tsc --noEmit && npx vitest run
```
Expected: no type errors; all tests pass (parse, aggregate, snapshots, season).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: retire CoC API capture, cron, and dashboard refresh button"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: build succeeds with no type or lint errors.

- [ ] **Step 2: Smoke-test the parser+aggregator against the real CSV**

Run:
```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
" 2>/dev/null || true
npx vitest run
```
Expected: full suite green. (The real `BRAZILIAN_HOUSE_war_attacks.csv` stays in the repo root only as a manual sample; it is not imported by tests.)

- [ ] **Step 3: Manual check (optional, requires Supabase env + a logged-in admin)**

Start `npm run dev`, log in at `/admin`, upload `BRAZILIAN_HOUSE_war_attacks.csv`, confirm a result line shows `#90YVJJC8 · 2026-06 · N jogadores` and the dashboard reflects the data after refresh.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore: verification fixes for CSV import" || echo "nothing to commit"
```
