import { describe, it, expect } from "vitest";
import { parseAttacksCsv } from "../../src/lib/csv/parse";

const HEADER =
  "tag,name,rank,thLevel,warID,order_,attackerTag,defenderTag,stars,new_stars," +
  "destructionPercentage,war_player.defenderTag,defenderName,defenderRank,defenderTH," +
  "attacker_is_home_clan,home_clan_tag,home_clan_name,home_clan_level," +
  "enemy_clan_tag,enemy_clan_name,enemy_clan_level,war_start_time,war_size,type";

describe("parseAttacksCsv", () => {
  it("parses a quoted comma-name row with a BOM", () => {
    const bom = "﻿";
    const row =
      '#A,",Garou\'",11,18,16054194,1,#A,#B,3,1,100,#B,scoqui,13,18,' +
      "1,#90YVJJC8,BRAZILIAN HOUSE,30,#E,FIRTINA,28,2026-06-25 09:39:44,15,league";
    const rows = parseAttacksCsv(`${bom}${HEADER}\n${row}\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0].tag).toBe("#A");
    expect(rows[0].name).toBe(",Garou'");
    expect(rows[0].stars).toBe(3);
    expect(rows[0].newStars).toBe(1);
    expect(rows[0].attackerIsHomeClan).toBe(1);
    expect(rows[0].homeClanTag).toBe("#90YVJJC8");
    expect(rows[0].warStartTime).toBe("2026-06-25 09:39:44");
    expect(rows[0].type).toBe("league");
  });

  it("throws when a required column is missing", () => {
    expect(() => parseAttacksCsv("tag,name\n#A,Bob\n")).toThrow(/missing columns/i);
  });
});
