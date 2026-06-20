// Small formatting helpers. UK spelling in user-facing copy (CLAUDE.md §10).

export function chf(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const n = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return `CHF ${n}`;
}

export function pct(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

export function signedPp(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}pp`;
}

export function price(
  value: number | null | undefined,
  ccy?: string | null,
  decimals = 2
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const n = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return ccy ? `${ccy} ${n}` : n;
}

export function compact(
  value: number | null | undefined,
  ccy?: string | null
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const n = new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return ccy ? `${ccy} ${n}` : n;
}

export function prettyDate(iso?: string | null): string {
  if (!iso) return "";
  // Accept both date-only and full ISO timestamps.
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function titleCase(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
