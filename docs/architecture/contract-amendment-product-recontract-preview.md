# Contract Amendment Product Recontract Preview

Status: implemented on `update`. Phase 6A preview snapshot persistence is implemented.

This phase adds an admin-only preview for financial product recontract requests. It does not execute the recontract.

Endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/
```

The backend calculates the preview. The frontend displays the response only.

The response includes old and new product, old and new contract totals, price difference, amount already paid, remaining balance before and after, current EMI, proposed EMI, pending EMI count, impact type, effective date preview, and warnings.

Impact types are:

```text
UPGRADE_EXTRA_PAYABLE
DOWNGRADE_CREDIT_REQUIRED
SAME_PRICE_REFERENCE_CORRECTION
```

The preview is read-only. It does not change subscription product, contract value, EMI rows, payments, receipts, accounting, reconciliation, inventory, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent demand, lease demand, or deposit records.

Phase 6A adds explicit admin-only persistence for backend-calculated preview evidence:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/save/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract-events/
```

Saving a preview snapshot creates a `ContractRecontractEvent` record with old/new product, contract totals, paid amount, remaining balances, current/proposed EMI, impact type, warnings, and the full backend preview JSON. It also records `source_record_mutation = false`.

The existing preview endpoint remains calculation-only. The save endpoint recalculates on the backend and stores that calculated result as audit evidence. If the preview cannot produce a complete READY snapshot, the save endpoint rejects the request instead of persisting partial blocked evidence.

Saving a preview snapshot is not execution. It does not mutate the real contract, EMI schedule, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

True execution remains future work. It must cover approval, repricing, future EMI schedule change, payment and receipt treatment, accounting entries, reconciliation impact, and audit trail.
