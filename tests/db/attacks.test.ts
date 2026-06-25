import { describe, it, expect } from "vitest";
import { attackRowToDb, dbRowToAttack } from "../../src/lib/db/attacks";
import type { AttackRow } from "../../src/lib/csv/parse";

const row: AttackRow = {
  tag: "#A", name: "Atk", rank: 3, thLevel: 17, warID: 999, order: 5,
  stars: 2, newStars: 1, destructionPercentage: 84,
  defenderTag: "#D", defenderName: "Def", defenderRank: 7, defenderTH: 18,
  attackerIsHomeClan: 1, homeClanTag: "#90YVJJC8",
  warStartTime: "2026-06-19 09:28:12", type: "league",
};

describe("attacks db mappers", () => {
  it("round-trips an AttackRow through the DB shape", () => {
    const back = dbRowToAttack(attackRowToDb(row));
    expect(back).toEqual(row);
  });

  it("maps attacker_is_home_clan to a boolean and back to 0/1", () => {
    const db = attackRowToDb(row);
    expect(db.attacker_is_home_clan).toBe(true);
    expect(dbRowToAttack({ ...db, attacker_is_home_clan: false }).attackerIsHomeClan).toBe(0);
  });
});
