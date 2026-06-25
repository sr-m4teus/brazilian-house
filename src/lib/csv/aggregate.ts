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
