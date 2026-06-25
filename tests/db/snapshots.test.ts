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
