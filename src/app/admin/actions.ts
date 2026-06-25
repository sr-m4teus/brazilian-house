"use server";
import { parseAttacksCsv } from "../../lib/csv/parse";
import { aggregate } from "../../lib/csv/aggregate";
import { insertAttacks } from "../../lib/db/attacks";

export interface UploadResult {
  fileName: string;
  clanTag?: string;
  seasons: string[];
  attacks: number;
  status: "ok" | "error";
  message?: string;
}

export async function uploadCsv(formData: FormData): Promise<UploadResult[]> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const results: UploadResult[] = [];

  for (const file of files) {
    try {
      const rows = parseAttacksCsv(await file.text());
      const attacks = await insertAttacks(rows);
      const seasons = aggregate(rows).map((s) => s.seasonKey); // feedback only
      results.push({
        fileName: file.name,
        clanTag: rows[0]?.homeClanTag,
        seasons,
        attacks,
        status: "ok",
        message: seasons.length === 0 ? "sem guerras de liga (linhas cruas salvas)" : undefined,
      });
    } catch (e) {
      results.push({
        fileName: file.name,
        seasons: [],
        attacks: 0,
        status: "error",
        message: (e as Error).message,
      });
    }
  }
  return results;
}
