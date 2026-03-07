export function formatCurrency(value: number, locale = "en-IN", currency = "INR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

export function formatDate(value: string | Date, locale = "en-IN"): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export function formatPercent(value: number, fractionDigits = 2): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}
