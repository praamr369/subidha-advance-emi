// Single source of truth for payment instruments across collection + payable
// forms. Solopreneur model: cash desk + one Bank/UPI holding account. Every
// non-cash instrument (UPI scanner, transfer, cheque, deposit) settles into the
// same bank account — only the process differs. Card and payment gateway are
// intentionally excluded (legacy records may still carry them).

export const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "DEPOSIT", label: "Bank Deposit" },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHOD_OPTIONS)[number]["value"];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  DEPOSIT: "Bank Deposit",
  // Legacy values kept only so historical records render a friendly label.
  BANK: "Bank",
  CARD: "Card",
};

/** A method settles to cash only when it is CASH; everything else is Bank/UPI. */
export function isCashMethod(method: string | null | undefined): boolean {
  return (method || "").toUpperCase() === "CASH";
}
