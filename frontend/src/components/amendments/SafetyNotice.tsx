export default function AmendmentSafetyNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="font-semibold">Guarded amendment implementation phase</div>
      <div className="mt-1">
        Phase 3 supports only whitelisted non-financial corrections after admin approval. Financial, contract-value, EMI,
        payment, lucky ID, product, rent/lease billing, deposit, accounting, inventory, reconciliation, commission, payout,
        delivery, stock, and audit-sensitive amendments remain blocked or deferred.
      </div>
    </div>
  );
}
