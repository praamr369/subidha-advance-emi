export default function AmendmentSafetyNotice() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="font-semibold">Decision-only amendment phase</div>
      <div className="mt-1">
        Approval records an admin decision only. Approved amendments are not implemented in this phase, and no EMI,
        payment, lucky ID, product, rent/lease, accounting, inventory, reconciliation, commission, payout, delivery,
        stock, or source contract record is changed from this UI.
      </div>
    </div>
  );
}
