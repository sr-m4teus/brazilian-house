import { publicClient } from "./supabase";

export interface CronRun {
  ran_at: string;
  season_key: string | null;
  status: string;
  detail: { tag: string; status: string; message?: string }[] | null;
}

export async function lastRuns(limit = 5): Promise<CronRun[]> {
  const db = publicClient();
  const { data } = await db
    .from("cron_runs")
    .select("ran_at,season_key,status,detail")
    .order("ran_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CronRun[];
}
