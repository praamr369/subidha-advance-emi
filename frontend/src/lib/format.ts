export function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "₹0.00";
  return `₹${num.toFixed(2)}`;
}
