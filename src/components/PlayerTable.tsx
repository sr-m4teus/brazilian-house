import Link from "next/link";
import type { PlayerRow } from "../lib/db/reads";

export function PlayerTable({ players }: { players: PlayerRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-clash-muted text-xs uppercase">
          <th className="text-left p-2 border-b border-clash-border">Jogador</th>
          <th className="p-2 border-b border-clash-border">CV</th>
          <th className="p-2 border-b border-clash-border">Atq</th>
          <th className="p-2 border-b border-clash-border">★</th>
          <th className="p-2 border-b border-clash-border">Dest%</th>
          <th className="p-2 border-b border-clash-border">Def ★</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.tag} className="border-b border-clash-card">
            <td className="p-2">
              <Link className="hover:text-clash-gold" href={`/player/${encodeURIComponent(p.tag)}`}>
                {p.name}
              </Link>
            </td>
            <td className="p-2 text-center">
              <span className="inline-block min-w-[24px] bg-clash-border rounded px-1.5 font-bold">{p.townhall_level}</span>
            </td>
            <td className="p-2 text-center">{p.attacks_used}/{p.attacks_available}</td>
            <td className="p-2 text-center text-clash-gold">{p.stars}★</td>
            <td className="p-2 text-center">{p.destruction_avg}%</td>
            <td className="p-2 text-center">{p.defensive_stars}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
