import { publicClient } from "./supabase";
import { loadAttacks } from "./attacks";
import { aggregate, type SeasonSnapshot } from "../csv/aggregate";
import { seasonLabel } from "../coc/season";
import type { AttackRow } from "../csv/parse";

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

export interface CareerData {
  player: { tag: string; name: string };
  totals: { seasons: number; stars: number; attacks: number; avgStars: number; avgDestruction: number };
  history: { seasonKey: string; clanName: string; townhall_level: number; stars: number; destruction_avg: number; defensive_stars: number }[];
}

export interface CareerInputClan {
  clanName: string;
  snaps: SeasonSnapshot[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function groupByClan(rows: AttackRow[]): Map<string, AttackRow[]> {
  const byClan = new Map<string, AttackRow[]>();
  for (const r of rows) {
    let arr = byClan.get(r.homeClanTag);
    if (!arr) {
      arr = [];
      byClan.set(r.homeClanTag, arr);
    }
    arr.push(r);
  }
  return byClan;
}

// --- pure transforms (unit-tested) ---

export function seasonsFromSnapshots(snaps: SeasonSnapshot[]): { key: string; label: string }[] {
  const keys = [...new Set(snaps.map((s) => s.seasonKey))];
  keys.sort((a, b) => b.localeCompare(a));
  return keys.map((key) => ({ key, label: seasonLabel(key) }));
}

export function dashboardFromSnapshots(
  clan: { tag: string; name: string; slot: number },
  seasonKey: string,
  snaps: SeasonSnapshot[],
): DashboardData | null {
  const found = snaps.find((s) => s.seasonKey === seasonKey);
  if (!found) return null;
  const snap = found.snapshot;
  const players: PlayerRow[] = snap.players.map((p) => ({
    tag: p.tag,
    name: p.name,
    townhall_level: p.townhallLevel,
    map_position: p.mapPosition,
    attacks_used: p.attacksUsed,
    attacks_available: p.attacksAvailable,
    stars: p.stars,
    destruction_avg: p.destructionAvg,
    defenses: p.defenses,
    defensive_stars: p.defensiveStars,
  }));
  return {
    clan,
    season: { key: seasonKey, label: seasonLabel(seasonKey) },
    totals: {
      total_stars: snap.totalStars,
      total_destruction: snap.totalDestruction,
      total_attacks: snap.totalAttacks,
      rank: null,
    },
    players,
  };
}

export function careerFromSnapshots(tag: string, clans: CareerInputClan[]): CareerData | null {
  const decoded = tag.startsWith("#") ? tag : `#${tag}`;
  const rows: (CareerData["history"][number] & { attacksUsed: number })[] = [];
  let playerName = "";
  for (const c of clans) {
    for (const s of c.snaps) {
      const p = s.snapshot.players.find((pl) => pl.tag === decoded);
      if (!p) continue;
      playerName = p.name;
      rows.push({
        seasonKey: s.seasonKey,
        clanName: c.clanName,
        townhall_level: p.townhallLevel,
        stars: p.stars,
        destruction_avg: p.destructionAvg,
        defensive_stars: p.defensiveStars,
        attacksUsed: p.attacksUsed,
      });
    }
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.seasonKey.localeCompare(a.seasonKey));

  const seasons = rows.length;
  const stars = rows.reduce((s, h) => s + h.stars, 0);
  const attacks = rows.reduce((s, h) => s + h.attacksUsed, 0);
  const destSum = rows.reduce((s, h) => s + h.destruction_avg, 0);

  return {
    player: { tag: decoded, name: playerName },
    totals: {
      seasons,
      stars,
      attacks,
      avgStars: attacks > 0 ? round2(stars / attacks) : 0,
      avgDestruction: seasons > 0 ? round2(destSum / seasons) : 0,
    },
    history: rows.map(({ attacksUsed, ...h }) => h),
  };
}

// --- DB-backed reads ---

export async function listClans(): Promise<{ tag: string; name: string; slot: number }[]> {
  const db = publicClient();
  const { data } = await db.from("clans").select("tag,name,slot").order("slot");
  return data ?? [];
}

export async function listSeasons(): Promise<{ key: string; label: string }[]> {
  const byClan = groupByClan(await loadAttacks());
  const all: SeasonSnapshot[] = [];
  for (const rows of byClan.values()) all.push(...aggregate(rows));
  return seasonsFromSnapshots(all);
}

export async function getDashboard(slot: number, seasonKey: string): Promise<DashboardData | null> {
  const db = publicClient();
  const { data: clan } = await db.from("clans").select("tag,name,slot").eq("slot", slot).single();
  if (!clan) return null;
  const snaps = aggregate(await loadAttacks(clan.tag));
  return dashboardFromSnapshots(clan, seasonKey, snaps);
}

export async function getCareer(tag: string): Promise<CareerData | null> {
  const db = publicClient();
  const { data: clans } = await db.from("clans").select("tag,name");
  const byClan = groupByClan(await loadAttacks());
  const input: CareerInputClan[] = [];
  for (const [clanTag, rows] of byClan) {
    const name = (clans ?? []).find((c) => c.tag === clanTag)?.name ?? clanTag;
    input.push({ clanName: name, snaps: aggregate(rows) });
  }
  return careerFromSnapshots(tag, input);
}
