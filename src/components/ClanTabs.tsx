import Link from "next/link";

export function ClanTabs({
  clans,
  activeSlot,
  seasonKey,
}: {
  clans: { tag: string; name: string; slot: number }[];
  activeSlot: number;
  seasonKey: string;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {clans.map((c) => (
        <Link
          key={c.slot}
          href={`/dashboard/${c.slot}/${seasonKey}`}
          className={`px-3 py-1.5 rounded-md border ${
            c.slot === activeSlot
              ? "bg-clash-gold text-clash-bg border-clash-gold font-bold"
              : "bg-clash-card border-clash-border text-clash-text"
          }`}
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}
