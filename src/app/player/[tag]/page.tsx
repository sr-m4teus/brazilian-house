import { notFound } from "next/navigation";
import Link from "next/link";
import { getCareer } from "../../../lib/db/reads";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const data = await getCareer(decodeURIComponent(tag));
  if (!data) notFound();

  return (
    <main className="max-w-2xl mx-auto p-4">
      <Link href="/" className="text-clash-muted hover:text-clash-gold text-sm">&larr; Voltar</Link>
      <h1 className="text-xl font-bold text-clash-gold mt-2">{data.player.name}</h1>
      <p className="text-clash-muted text-xs mb-4">{data.player.tag}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat big={data.totals.seasons} lbl="Ligas" />
        <Stat big={data.totals.stars} lbl="Total ★" />
        <Stat big={data.totals.avgStars} lbl="Média ★/atq" />
        <Stat big={`${data.totals.avgDestruction}%`} lbl="Média Dest" />
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-clash-muted text-xs uppercase">
            <th className="text-left p-2 border-b border-clash-border">Liga</th>
            <th className="p-2 border-b border-clash-border">Clã</th>
            <th className="p-2 border-b border-clash-border">CV</th>
            <th className="p-2 border-b border-clash-border">★</th>
            <th className="p-2 border-b border-clash-border">Dest%</th>
            <th className="p-2 border-b border-clash-border">Def ★</th>
          </tr>
        </thead>
        <tbody>
          {data.history.map((h) => (
            <tr key={h.seasonKey + h.clanName} className="border-b border-clash-card">
              <td className="p-2">{h.seasonKey}</td>
              <td className="p-2">{h.clanName}</td>
              <td className="p-2 text-center">{h.townhall_level}</td>
              <td className="p-2 text-center text-clash-gold">{h.stars}★</td>
              <td className="p-2 text-center">{h.destruction_avg}%</td>
              <td className="p-2 text-center">{h.defensive_stars}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function Stat({ big, lbl }: { big: React.ReactNode; lbl: string }) {
  return (
    <div className="bg-clash-card border border-clash-border rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-clash-gold">{big}</div>
      <div className="text-xs uppercase tracking-wide text-clash-muted">{lbl}</div>
    </div>
  );
}
