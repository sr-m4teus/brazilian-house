import { notFound } from "next/navigation";
import { getDashboard, listSeasons, listClans } from "../../../../lib/db/reads";
import { SummaryCards } from "../../../../components/SummaryCards";
import { PlayerTable } from "../../../../components/PlayerTable";
import { ClanTabs } from "../../../../components/ClanTabs";
import { SeasonSelect } from "../../../../components/SeasonSelect";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ clan: string; season: string }>;
}) {
  const { clan, season } = await params;
  const slot = Number(clan);
  const [data, seasons, clans] = await Promise.all([
    getDashboard(slot, season),
    listSeasons(),
    listClans(),
  ]);
  if (!data) notFound();

  return (
    <main className="max-w-3xl mx-auto p-4">
      <div className="flex gap-2 items-center flex-wrap mb-4">
        <ClanTabs clans={clans} activeSlot={slot} seasonKey={season} />
        <SeasonSelect seasons={seasons} activeKey={season} slot={slot} />
      </div>
      <SummaryCards totals={data.totals} />
      <div className="bg-clash-card border border-clash-border rounded-lg p-3">
        <PlayerTable players={data.players} />
      </div>
    </main>
  );
}
