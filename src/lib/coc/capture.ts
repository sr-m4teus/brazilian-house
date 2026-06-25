import { getLeagueGroup, getSeasonWars } from "./client";
import { mapSeason } from "./mapper";
import { seasonKey } from "./season";
import { persistSnapshot } from "../db/snapshots";
import { serviceClient } from "../db/supabase";

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
      await persistSnapshot(group.season ?? key, snap);
      perClan.push({ tag, status: "ok" });
    } catch (e) {
      perClan.push({ tag, status: "error", message: (e as Error).message });
    }
  }

  const anyError = perClan.some((c) => c.status === "error");
  const allOk = perClan.every((c) => c.status === "ok");
  await serviceClient().from("cron_runs").insert({
    season_key: key,
    status: anyError ? (allOk ? "ok" : "partial") : "ok",
    detail: perClan,
  });

  return { seasonKey: key, perClan };
}
