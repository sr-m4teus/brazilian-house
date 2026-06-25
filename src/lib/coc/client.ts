import type { RawLeagueGroup, RawCwlWar } from "./types";

const BASE = process.env.COC_API_BASE ?? "https://proxy.royaleapi.dev/v1";

function authHeaders(): HeadersInit {
  const token = process.env.COC_API_TOKEN;
  if (!token) throw new Error("COC_API_TOKEN is not set");
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function enc(tag: string): string {
  // CoC tags must be URL-encoded; "#" -> "%23"
  return encodeURIComponent(tag.startsWith("#") ? tag : `#${tag}`);
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`CoC API ${res.status} on ${path}: ${body}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/** Returns null when the clan is not currently in a CWL (API 404). */
export async function getLeagueGroup(clanTag: string): Promise<RawLeagueGroup | null> {
  try {
    return await get<RawLeagueGroup>(`/clans/${enc(clanTag)}/currentwar/leaguegroup`);
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

export async function getCwlWar(warTag: string): Promise<RawCwlWar> {
  return get<RawCwlWar>(`/clanwarleagues/wars/${enc(warTag)}`);
}

/** Fetch every assigned war in a league group (skips unassigned "#0"). */
export async function getSeasonWars(group: RawLeagueGroup): Promise<RawCwlWar[]> {
  const warTags = group.rounds
    .flatMap((r) => r.warTags)
    .filter((t) => t && t !== "#0");
  const wars = await Promise.all(warTags.map((t) => getCwlWar(t)));
  return wars;
}
