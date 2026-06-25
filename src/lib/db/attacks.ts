import type { AttackRow } from "../csv/parse";
import { publicClient, serviceClient } from "./supabase";

export interface AttackDbRow {
  war_id: number;
  order_: number;
  attacker_tag: string;
  attacker_name: string;
  attacker_rank: number;
  attacker_th: number;
  defender_tag: string;
  defender_name: string;
  defender_rank: number;
  defender_th: number;
  stars: number;
  new_stars: number;
  destruction: number;
  attacker_is_home_clan: boolean;
  home_clan_tag: string;
  war_start_time: string;
  type: string;
}

export function attackRowToDb(r: AttackRow): AttackDbRow {
  return {
    war_id: r.warID,
    order_: r.order,
    attacker_tag: r.tag,
    attacker_name: r.name,
    attacker_rank: r.rank,
    attacker_th: r.thLevel,
    defender_tag: r.defenderTag,
    defender_name: r.defenderName,
    defender_rank: r.defenderRank,
    defender_th: r.defenderTH,
    stars: r.stars,
    new_stars: r.newStars,
    destruction: r.destructionPercentage,
    attacker_is_home_clan: r.attackerIsHomeClan === 1,
    home_clan_tag: r.homeClanTag,
    war_start_time: r.warStartTime,
    type: r.type,
  };
}

export function dbRowToAttack(d: AttackDbRow): AttackRow {
  return {
    tag: d.attacker_tag,
    name: d.attacker_name,
    rank: d.attacker_rank,
    thLevel: d.attacker_th,
    warID: d.war_id,
    order: d.order_,
    stars: d.stars,
    newStars: d.new_stars,
    destructionPercentage: Number(d.destruction),
    defenderTag: d.defender_tag,
    defenderName: d.defender_name,
    defenderRank: d.defender_rank,
    defenderTH: d.defender_th,
    attackerIsHomeClan: d.attacker_is_home_clan ? 1 : 0,
    homeClanTag: d.home_clan_tag,
    warStartTime: d.war_start_time,
    type: d.type,
  };
}

/** Upsert raw attacks in batches; dedupes on (war_id, order_). */
export async function insertAttacks(rows: AttackRow[]): Promise<number> {
  const db = serviceClient();
  const dbRows = rows.map(attackRowToDb);
  for (let i = 0; i < dbRows.length; i += 500) {
    const { error } = await db
      .from("attacks")
      .upsert(dbRows.slice(i, i + 500), { onConflict: "war_id,order_" });
    if (error) throw error;
  }
  return dbRows.length;
}

/** Load raw attacks, paginating past Supabase's 1000-row default cap. */
export async function loadAttacks(homeClanTag?: string): Promise<AttackRow[]> {
  const db = publicClient();
  const pageSize = 1000;
  const out: AttackRow[] = [];
  for (let from = 0; ; from += pageSize) {
    let q = db.from("attacks").select("*").order("id").range(from, from + pageSize - 1);
    if (homeClanTag) q = q.eq("home_clan_tag", homeClanTag);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []).map((d) => dbRowToAttack(d as AttackDbRow));
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}
