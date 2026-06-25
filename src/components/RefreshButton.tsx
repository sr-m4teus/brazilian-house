"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { forceRefresh } from "../app/admin/actions";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await forceRefresh();
          router.refresh();
        })
      }
      className="px-2.5 py-1.5 rounded-md bg-clash-gold text-clash-bg font-bold disabled:opacity-50"
    >
      {pending ? "Atualizando…" : "Atualizar"}
    </button>
  );
}
