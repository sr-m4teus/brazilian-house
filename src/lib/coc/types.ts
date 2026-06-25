// --- Raw CoC API shapes (subset we consume) ---
export interface RawWarAttack {
  attackerTag: string;
  defenderTag: string;
  stars: number;
  destructionPercentage: number;
  order: number;
}

export interface RawWarMember {
  tag: string;
  name: string;
  townhallLevel: number;
  mapPosition: number;
  attacks?: RawWarAttack[];
  opponentAttacks: number;
  bestOpponentAttack?: RawWarAttack;
}

export interface RawWarClan {
  tag: string;
  name: string;
  stars: number;
  destructionPercentage: number;
  attacks: number;
  members: RawWarMember[];
}

export interface RawCwlWar {
  state: "preparation" | "inWar" | "warEnded" | string;
  teamSize: number;
  clan: RawWarClan;
  opponent: RawWarClan;
}

export interface RawLeagueGroupRound {
  warTags: string[]; // "#0" means not yet assigned
}

export interface RawLeagueGroup {
  state: string;
  season: string; // e.g. "2026-06"
  clans: { tag: string; name: string }[];
  rounds: RawLeagueGroupRound[];
}

// --- Domain output (what we persist) ---
export interface PlayerSeasonStats {
  tag: string;
  name: string;
  townhallLevel: number;
  mapPosition: number;
  attacksUsed: number;
  attacksAvailable: number;
  stars: number;
  destructionAvg: number;
  threeStars: number;
  twoStars: number;
  oneStars: number;
  zeroStars: number;
  missed: number;
  defenses: number;
  defensiveStars: number;
  defensiveDestruction: number;
}

export interface ClanSeasonSnapshot {
  clanTag: string;
  totalStars: number;
  totalDestruction: number; // average destruction across the clan's attacks
  totalAttacks: number;
  players: PlayerSeasonStats[];
}
