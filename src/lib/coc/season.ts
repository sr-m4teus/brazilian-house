export function seasonKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function seasonLabel(key: string): string {
  const [y, m] = key.split("-");
  return `Liga ${m}/${y}`;
}

export function isCwlWindow(d: Date): boolean {
  const day = d.getUTCDate();
  return day >= 1 && day <= 12;
}
