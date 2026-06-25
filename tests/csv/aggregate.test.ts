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
