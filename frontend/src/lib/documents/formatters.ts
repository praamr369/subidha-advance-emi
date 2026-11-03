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
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(numeric);
}

export function formatOptionalDocumentMoney(value: string | number | null | undefined, fallback = "—"): string {
  const formatted = formatDocumentMoney(value);
  return formatted === "—" ? fallback : formatted;
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

export function numberToIndianWords(amount: number | string | null | undefined): string {
  const num = Math.round(Number(amount || 0));
  if (num <= 0 || !Number.isFinite(num)) return "Zero Rupees Only";

  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ",
    "Ten ", "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ",
    "Seventeen ", "Eighteen ", "Nineteen ",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n: number): string {
    if (n === 0) return "";
    let str = "";
    if (n >= 10000000) {
      str += inWords(Math.floor(n / 10000000)) + "Crore ";
      n %= 10000000;
    }
    if (n >= 100000) {
      str += inWords(Math.floor(n / 100000)) + "Lakh ";
      n %= 100000;
    }
    if (n >= 1000) {
      str += inWords(Math.floor(n / 1000)) + "Thousand ";
      n %= 1000;
    }
    if (n >= 100) {
      str += inWords(Math.floor(n / 100)) + "Hundred ";
      n %= 100;
    }
    if (n > 0) {
      if (str !== "") str += "and ";
      if (n < 20) {
        str += a[n];
      } else {
        str += b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : " ");
      }
    }
    return str;
  }

  return inWords(num).trim() + " Rupees Only";
}
