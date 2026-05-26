# Contract Amendment Product Recontract Preview

Status: implemented on `update`.

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

True execution remains future work. It must cover approval, repricing, future EMI schedule change, payment and receipt treatment, accounting entries, reconciliation impact, and audit trail.
