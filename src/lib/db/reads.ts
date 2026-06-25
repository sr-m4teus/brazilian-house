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
