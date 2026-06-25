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
