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
