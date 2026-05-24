const UNSAFE_DOCUMENT_STATUS_LABELS: Record<string, string> = {
  CANCELLED: "CANCELLED",
  VOID: "VOIDED",
  VOIDED: "VOIDED",
  REVERSED: "REVERSED",
  RETURNED: "RETURNED",
  DRAFT: "DRAFT",
  CLOSED: "CLOSED",
  INACTIVE: "INACTIVE",
  DEFAULTED: "DEFAULTED",
  FAILED: "FAILED",
  REOPENED: "REOPENED",
  INCOMPLETE: "INCOMPLETE",
  UNBALANCED: "UNBALANCED",
  UNRECONCILED: "UNRECONCILED",
};

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

export function normalizeDocumentStatus(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

export function unsafeDocumentStatusLabel(status: string | null | undefined): string | null {
  const token = normalizeDocumentStatus(status);
  return UNSAFE_DOCUMENT_STATUS_LABELS[token] ?? null;
}

export function isUnsafeDocumentStatus(status: string | null | undefined): boolean {
  return unsafeDocumentStatusLabel(status) !== null;
}

export function documentStatusWatermark(status: string | null | undefined): string | null {
  return unsafeDocumentStatusLabel(status);
}

export function documentUnsafeStatusMessage(
  status: string | null | undefined,
  documentName = "document"
): string | null {
  const label = unsafeDocumentStatusLabel(status);
  if (!label) return null;
  return `This ${documentName} is ${label}. It must not be treated as a normal active or paid record.`;
}

export function hasPositiveDocumentAmount(value: string | number | null | undefined): boolean {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0;
}

export function documentTitleForTaxMode(taxMode: string | null | undefined): string {
  return (taxMode || "").toUpperCase() === "GST" ? "TAX INVOICE" : "NON-GST INVOICE";
}

export function safeDocumentText(value: string | number | null | undefined, fallback = "—"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}
