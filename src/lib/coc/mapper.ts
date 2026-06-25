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

      if (m.bestOpponentAttack) {
        stats.defenses += 1;
        stats.defensiveStars += m.bestOpponentAttack.stars;
        defDestSum.set(
          m.tag,
          (defDestSum.get(m.tag) ?? 0) + m.bestOpponentAttack.destructionPercentage,
        );
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
