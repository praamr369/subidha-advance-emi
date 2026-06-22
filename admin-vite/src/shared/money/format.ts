export function formatMoney(value: string | number | undefined | null): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "NPR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatCompact(value: string | number | undefined | null): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "—";
  if (num >= 1_00_00_000) return `${(num / 1_00_00_000).toFixed(1)}Cr`;
  if (num >= 1_00_000) return `${(num / 1_00_000).toFixed(1)}L`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(2);
}
