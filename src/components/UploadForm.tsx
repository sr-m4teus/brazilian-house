"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { uploadCsv, type UploadResult } from "../app/admin/actions";

export function UploadForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [results, setResults] = useState<UploadResult[] | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      const res = await uploadCsv(form);
      setResults(res);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 space-y-3">
      <input
        name="files"
        type="file"
        accept=".csv"
        multiple
        required
        className="block text-sm text-clash-text"
      />
      <button
        disabled={pending}
        className="bg-clash-gold text-clash-bg font-bold px-4 py-2 rounded-md disabled:opacity-50"
      >
        {pending ? "Enviando…" : "Enviar CSV"}
      </button>
      {results && (
        <ul className="space-y-1 text-sm mt-2">
          {results.map((r, i) => (
            <li key={i} className={r.status === "ok" ? "text-clash-text" : "text-red-400"}>
              {r.fileName}:{" "}
              {r.status === "ok"
                ? `${r.clanTag} · ${r.seasons.join(", ")} · ${r.players} jogadores`
                : r.message}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
