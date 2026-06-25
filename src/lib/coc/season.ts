export function seasonKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function seasonLabel(key: string): string {
  const parts = key.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `Liga ${d}/${m}/${y}`;
  }
  const [y, m] = parts;
  return `Liga ${m}/${y}`;
}

export function isCwlWindow(d: Date): boolean {
  const day = d.getUTCDate();
  return day >= 1 && day <= 12;
}
