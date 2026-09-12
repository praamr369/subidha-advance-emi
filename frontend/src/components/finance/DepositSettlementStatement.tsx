import { formatRupee } from "@/lib/utils/currency";
import type { DepositSettlement } from "@/services/phase4-finance";

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  NOT_COLLECTED: { label: "Not collected", tone: "border-border text-muted-foreground" },
  HELD: { label: "Held", tone: "border-sky-300 text-sky-700 dark:text-sky-300" },
  REFUND_PENDING: { label: "Refund pending", tone: "border-amber-300 text-amber-700 dark:text-amber-300" },
  SETTLED: { label: "Settled", tone: "border-green-300 text-green-700 dark:text-green-300" },
};

function isPositive(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function Row({
  label,
  value,
  hint,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <tr className={strong ? "border-t border-border" : undefined}>
      <td className={`py-1.5 pr-3 ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
        {label}
        {hint ? <span className="ml-2 text-xs text-muted-foreground">{hint}</span> : null}
      </td>
      <td className={`py-1.5 text-right tabular-nums ${strong ? "font-semibold" : ""} ${tone ?? "text-foreground"}`}>{value}</td>
    </tr>
  );
}

/** Deposit received, less each deduction, refund due, paid, and what is still owed to the customer. */
export default function DepositSettlementStatement({ settlement }: { settlement: DepositSettlement }) {
  const status = STATUS_COPY[settlement.status] ?? STATUS_COPY.HELD;
  const owed = isPositive(settlement.refund_balance);

  return (
    <section className="mt-4 rounded-xl border bg-card p-4" aria-label="Security deposit settlement">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deposit settlement</h3>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${status.tone}`}>{status.label}</span>
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody>
          <Row label="Deposit received from customer" value={formatRupee(settlement.received)} />
          {settlement.deductions.length > 0 ? (
            settlement.deductions.map((deduction) => (
              <Row
                key={deduction.transaction_number}
                label={`Less: deducted${deduction.reason ? ` (${deduction.reason})` : ""}`}
                hint={deduction.date ?? undefined}
                value={`− ${formatRupee(deduction.amount)}`}
                tone="text-red-600 dark:text-red-400"
              />
            ))
          ) : (
            <Row label="Less: deducted" value={`− ${formatRupee(settlement.deducted)}`} />
          )}
          <Row label="Refund due to customer" value={formatRupee(settlement.refund_due)} strong />
          <Row label="Refund paid to customer" value={formatRupee(settlement.refund_paid)} />
          <Row
            label="Balance still to pay customer"
            value={formatRupee(settlement.refund_balance)}
            strong
            tone={owed ? "text-amber-700 dark:text-amber-300" : undefined}
          />
        </tbody>
      </table>
      {owed && isPositive(settlement.refund_approved) ? (
        <p className="mt-3 text-xs text-muted-foreground">
          A refund of {formatRupee(settlement.refund_approved)} is approved but not paid yet. Record the payout from
          Finance → Deposits once the money is handed to the customer.
        </p>
      ) : null}
    </section>
  );
}
