export function parseApiError(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const raw = error.message?.trim() || "Request failed";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferredKeys = [
      "detail",
      "non_field_errors",
      "lucky_id",
      "batch",
      "customer",
      "product",
      "tenure_months",
    ];

    for (const key of preferredKeys) {
      const value = parsed[key];
      if (Array.isArray(value) && value[0]) return String(value[0]);
      if (typeof value === "string") return value;
    }

    const first = Object.values(parsed)[0];
    if (Array.isArray(first) && first[0]) return String(first[0]);
    if (typeof first === "string") return first;
  } catch {
    return raw;
  }

  return raw;
}

export function formatCurrency(value: string | number | null | undefined): string {
  const amount = Number(value || 0);
  return `₹${amount.toFixed(2)}`;
}
