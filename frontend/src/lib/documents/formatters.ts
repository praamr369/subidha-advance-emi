export function formatDocumentMoney(value: string | number | null | undefined): string {
  const numeric = Number(value ?? 0);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(safeValue);
}

export function formatDocumentDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatDocumentDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function joinDocumentLines(parts: Array<string | null | undefined>): string {
  return parts.map((part) => (part || "").trim()).filter(Boolean).join("\n");
}

export function documentStatusWatermark(status: string | null | undefined): string | null {
  const token = (status || "").trim().toUpperCase();
  if (["CANCELLED", "VOID", "VOIDED", "DRAFT", "RETURNED", "REVERSED"].includes(token)) {
    return token === "VOID" ? "VOIDED" : token;
  }
  return null;
}

export function documentTitleForTaxMode(taxMode: string | null | undefined): string {
  return (taxMode || "").toUpperCase() === "GST" ? "TAX INVOICE" : "NON-GST INVOICE";
}

export function safeDocumentText(value: string | number | null | undefined, fallback = "—"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}
