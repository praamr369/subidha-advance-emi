import type { ReactNode } from "react";

const EMPTY_TEXT_TOKENS = new Set([
  "",
  "-",
  "--",
  "—",
  "na",
  "n/a",
  "null",
  "none",
  "undefined",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeString(input: string): string {
  return input.trim().toLowerCase();
}

export function isDisplayEmpty(value: ReactNode): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  if (typeof value === "string") {
    const normalized = normalizeString(value);
    return EMPTY_TEXT_TOKENS.has(normalized);
  }
  if (Array.isArray(value)) return value.every((item) => isDisplayEmpty(item as ReactNode));
  return false;
}

export function toSafeNumber(value: unknown, fallback = 0): number {
  if (isFiniteNumber(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,\s]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function toSafeText(value: unknown, fallback = "—"): string {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return fallback;
    if (EMPTY_TEXT_TOKENS.has(normalizeString(text))) return fallback;
    return text;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return fallback;
}

export function toSafeMoney(
  value: unknown,
  options?: {
    locale?: string;
    currencySymbol?: string;
    fallback?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  const {
    locale = "en-IN",
    currencySymbol = "₹",
    fallback = "₹0.00",
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options || {};

  const numericValue = toSafeNumber(value, Number.NaN);
  if (!Number.isFinite(numericValue)) return fallback;

  return `${currencySymbol}${new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(numericValue)}`;
}

export function toSafeDate(
  value: unknown,
  options?: { fallback?: string; locale?: string }
): string {
  const { fallback = "—", locale = "en-IN" } = options || {};
  if (typeof value !== "string" || !value.trim()) return fallback;

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function toSafeDateTime(
  value: unknown,
  options?: { fallback?: string; locale?: string }
): string {
  const { fallback = "—", locale = "en-IN" } = options || {};
  if (typeof value !== "string" || !value.trim()) return fallback;

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SMALL_NUMBERS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

function numberBelowHundredToWords(value: number): string {
  if (value < 20) return SMALL_NUMBERS[value] ?? "";
  const tens = Math.floor(value / 10);
  const remainder = value % 10;
  return remainder ? `${TENS[tens]} ${SMALL_NUMBERS[remainder]}` : TENS[tens] ?? "";
}

function numberToIndianWords(value: number): string {
  if (value === 0) return "zero";

  const parts: string[] = [];
  const crore = Math.floor(value / 10000000);
  const lakh = Math.floor((value % 10000000) / 100000);
  const thousand = Math.floor((value % 100000) / 1000);
  const hundred = Math.floor((value % 1000) / 100);
  const belowHundred = value % 100;

  if (crore > 0) parts.push(`${numberToIndianWords(crore)} crore`);
  if (lakh > 0) parts.push(`${numberBelowHundredToWords(lakh)} lakh`);
  if (thousand > 0) parts.push(`${numberBelowHundredToWords(thousand)} thousand`);
  if (hundred > 0) parts.push(`${SMALL_NUMBERS[hundred]} hundred`);
  if (belowHundred > 0) {
    const conjunction = parts.length > 0 ? "and " : "";
    parts.push(`${conjunction}${numberBelowHundredToWords(belowHundred)}`);
  }

  return parts.join(" ");
}

function toTitleCase(input: string): string {
  return input
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function toAmountInWordsINR(value: unknown): string {
  const numericValue = Math.max(0, toSafeNumber(value, 0));
  const rupees = Math.floor(numericValue);
  const paise = Math.round((numericValue - rupees) * 100);

  const rupeesWords = toTitleCase(numberToIndianWords(rupees));
  if (paise <= 0) return `Rupees ${rupeesWords} Only`;

  const paiseWords = toTitleCase(numberToIndianWords(paise));
  return `Rupees ${rupeesWords} And ${paiseWords} Paise Only`;
}
