"use client";
import { useRouter } from "next/navigation";

export function SeasonSelect({
  seasons,
  activeKey,
  slot,
}: {
  seasons: { key: string; label: string }[];
  activeKey: string;
  slot: number;
}) {
  const router = useRouter();
  return (
    <select
      value={activeKey}
      onChange={(e) => router.push(`/dashboard/${slot}/${e.target.value}`)}
      className="ml-auto px-2.5 py-1.5 rounded-md bg-clash-card border border-clash-border text-clash-text"
    >
      {seasons.map((s) => (
        <option key={s.key} value={s.key}>{s.label}</option>
      ))}
    </select>
  );
}
