import { redirect } from "next/navigation";
import { listSeasons, listClans } from "../lib/db/reads";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [seasons, clans] = await Promise.all([listSeasons(), listClans()]);
  if (seasons.length === 0 || clans.length === 0) {
    return <main className="p-8"><p className="text-clash-muted">Sem dados ainda. Aguarde a próxima Liga.</p></main>;
  }
  redirect(`/dashboard/${clans[0].slot}/${seasons[0].key}`);
}
