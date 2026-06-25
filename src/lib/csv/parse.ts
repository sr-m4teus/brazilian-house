import Papa from "papaparse";

export interface AttackRow {
  tag: string;
  name: string;
  rank: number;
  thLevel: number;
  warID: number;
  order: number;
  stars: number;
  newStars: number;
  destructionPercentage: number;
  defenderTag: string;
  defenderName: string;
  defenderRank: number;
  defenderTH: number;
  attackerIsHomeClan: number;
  homeClanTag: string;
  warStartTime: string;
  type: string;
}

const REQUIRED = [
  "tag", "name", "rank", "thLevel", "warID", "order_", "stars", "new_stars",
  "destructionPercentage", "defenderTag", "defenderName", "defenderRank",
  "defenderTH", "attacker_is_home_clan", "home_clan_tag", "war_start_time", "type",
];

export function parseAttacksCsv(text: string): AttackRow[] {
  const clean = text.replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: true,
  });
  const fields = parsed.meta.fields ?? [];
  const missing = REQUIRED.filter((c) => !fields.includes(c));
  if (missing.length) {
    throw new Error(`CSV missing columns: ${missing.join(", ")}`);
  }
  return parsed.data.map((r) => ({
    tag: r.tag,
    name: r.name,
    rank: Number(r.rank),
    thLevel: Number(r.thLevel),
    warID: Number(r.warID),
    order: Number(r.order_),
    stars: Number(r.stars),
    newStars: Number(r.new_stars),
    destructionPercentage: Number(r.destructionPercentage),
    defenderTag: r.defenderTag,
    defenderName: r.defenderName,
    defenderRank: Number(r.defenderRank),
    defenderTH: Number(r.defenderTH),
    attackerIsHomeClan: Number(r.attacker_is_home_clan),
    homeClanTag: r.home_clan_tag,
    warStartTime: r.war_start_time,
    type: r.type,
  }));
}
