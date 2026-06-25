import { describe, it, expect } from "vitest";
import {
  dashboardFromSnapshots,
  seasonsFromSnapshots,
  careerFromSnapshots,
  weightedScore,
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

  it("orders players by weighted score (80% attack, 20% defense)", () => {
    const ranked: SeasonSnapshot[] = [
      {
        seasonKey: "2026-06-19",
        snapshot: {
          clanTag: "#90YVJJC8", totalStars: 21, totalAttacks: 14, totalDestruction: 90,
          players: [
            // strong defender, weak attacker -> 0.8*1 + 0.2*3 = 1.4
            player({ tag: "#DEF", name: "Def", mapPosition: 1, stars: 7, defensiveStars: 21 }),
            // strong attacker, no defense -> 0.8*2 + 0.2*0 = 1.6
            player({ tag: "#ATK", name: "Atk", mapPosition: 2, stars: 14, defensiveStars: 0 }),
          ],
        },
      },
    ];
    const d = dashboardFromSnapshots(clan, "2026-06-19", ranked)!;
    expect(d.players.map((p) => p.tag)).toEqual(["#ATK", "#DEF"]);
  });
});

describe("weightedScore", () => {
  it("weights attack 80% and defense 20%, normalized per 7", () => {
    expect(weightedScore(14, 0)).toBeCloseTo(1.6, 5); // 0.8 * 14/7
    expect(weightedScore(0, 7)).toBeCloseTo(0.2, 5); // 0.2 * 7/7
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
