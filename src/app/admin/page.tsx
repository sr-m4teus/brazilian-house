import { lastRuns } from "../../lib/db/runs";
import { UploadForm } from "../../components/UploadForm";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const runs = await lastRuns();
  return (
    <main className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-bold text-clash-gold mb-4">Admin</h1>
      <UploadForm />
      <h2 className="text-clash-muted uppercase text-xs mb-2">Últimos runs</h2>
      <ul className="space-y-2">
        {runs.map((r, i) => (
          <li key={i} className="bg-clash-card border border-clash-border rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span>{new Date(r.ran_at).toLocaleString("pt-BR")}</span>
              <span className="text-clash-gold">{r.status}</span>
            </div>
            <div className="text-clash-muted text-xs mt-1">
              {(r.detail ?? []).map((d) => `${d.tag}: ${d.status}`).join("  ·  ")}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
