export function SummaryCards({
  totals,
}: {
  totals: { total_stars: number; total_destruction: number; total_attacks: number; rank: number | null };
}) {
  const cards = [
    { big: totals.total_stars, lbl: "Estrelas" },
    { big: `${totals.total_destruction}%`, lbl: "Destruição" },
    { big: totals.total_attacks, lbl: "Ataques" },
    { big: totals.rank ? `${totals.rank}º` : "—", lbl: "Ranking" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {cards.map((c) => (
        <div key={c.lbl} className="bg-clash-card border border-clash-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-clash-gold">{c.big}</div>
          <div className="text-xs uppercase tracking-wide text-clash-muted">{c.lbl}</div>
        </div>
      ))}
    </div>
  );
}
