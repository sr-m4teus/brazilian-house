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
    expect(snap.totalDestruction).toBe(95.5);
  });

  it("picks our clan whether it is on the clan or opponent side", () => {
    const swapped = { ...(war1 as RawCwlWar), clan: (war1 as RawCwlWar).opponent, opponent: (war1 as RawCwlWar).clan };
    const snap = mapSeason([swapped as RawCwlWar], "#OURCLAN");
    expect(snap.players).toHaveLength(2);

    const p1 = snap.players.find((p) => p.tag === "#P1")!;
    expect(p1.stars).toBe(3);
    expect(p1.townhallLevel).toBe(16);
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
