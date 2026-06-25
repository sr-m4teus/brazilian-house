import { getLeagueGroup, getSeasonWars } from "./client";
import { mapSeason } from "./mapper";
import { seasonKey } from "./season";
import { persistSnapshot } from "../db/snapshots";
import { serviceClient } from "../db/supabase";
import type { RawCwlWar } from "./types";

function computeRanks(wars: RawCwlWar[]): Map<string, number> {
  const totals = new Map<string, { stars: number; dest: number }>();
  for (const war of wars) {
    for (const side of [war.clan, war.opponent]) {
      const t = totals.get(side.tag) ?? { stars: 0, dest: 0 };
      t.stars += side.stars;
      t.dest += side.destructionPercentage;
      totals.set(side.tag, t);
    }
  }
  const sorted = [...totals.entries()].sort(
    (a, b) => b[1].stars - a[1].stars || b[1].dest - a[1].dest,
  );
  const ranks = new Map<string, number>();
  sorted.forEach(([tag], i) => ranks.set(tag, i + 1));
  return ranks;
}

export interface CaptureResult {
  seasonKey: string;
  perClan: { tag: string; status: "ok" | "no-league" | "error"; message?: string }[];
}

const CLAN_TAGS = [
  process.env.CLAN_1_TAG,
  process.env.CLAN_2_TAG,
  process.env.CLAN_3_TAG,
].filter(Boolean) as string[];

export async function captureAll(now = new Date()): Promise<CaptureResult> {
  const key = seasonKey(now);
  const perClan: CaptureResult["perClan"] = [];

  for (const tag of CLAN_TAGS) {
    try {
      const group = await getLeagueGroup(tag);
      if (!group) {
        perClan.push({ tag, status: "no-league" });
        continue;
      }
      const wars = await getSeasonWars(group);
      const snap = mapSeason(wars, tag);
      const rank = computeRanks(wars).get(tag) ?? null;
      await persistSnapshot(group.season ?? key, snap, rank);
      perClan.push({ tag, status: "ok" });
    } catch (e) {
      perClan.push({ tag, status: "error", message: (e as Error).message });
    }
  }

  const errorCount = perClan.filter((c) => c.status === "error").length;
  const status = errorCount === 0 ? "ok" : errorCount === perClan.length ? "error" : "partial";
  const { error: runErr } = await serviceClient().from("cron_runs").insert({
    season_key: key,
    status,
    detail: perClan,
  });
  if (runErr) console.error("cron_runs insert failed:", runErr.message);

  return { seasonKey: key, perClan };
}
