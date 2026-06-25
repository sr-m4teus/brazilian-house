"use server";
import { parseAttacksCsv } from "../../lib/csv/parse";
import { aggregate } from "../../lib/csv/aggregate";
import { persistSnapshot } from "../../lib/db/snapshots";

export interface UploadResult {
  fileName: string;
  clanTag?: string;
  seasons: string[];
  players: number;
  status: "ok" | "error";
  message?: string;
}

export async function uploadCsv(formData: FormData): Promise<UploadResult[]> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const results: UploadResult[] = [];

  for (const file of files) {
    try {
      const text = await file.text();
      const snaps = aggregate(parseAttacksCsv(text));
      if (snaps.length === 0) throw new Error("sem guerras de liga no arquivo");

      let players = 0;
      for (const s of snaps) {
        await persistSnapshot(s.seasonKey, s.snapshot, null);
        players += s.snapshot.players.length;
      }
      results.push({
        fileName: file.name,
        clanTag: snaps[0].snapshot.clanTag,
        seasons: snaps.map((s) => s.seasonKey),
        players,
        status: "ok",
      });
    } catch (e) {
      results.push({
        fileName: file.name,
        seasons: [],
        players: 0,
        status: "error",
        message: (e as Error).message,
      });
    }
  }
  return results;
}
