# Unified Collection Workflow

## Purpose

The unified collection UX gives admin and cashier staff one search box before they choose the correct posting workflow.

Search prompt:

```text
Search by phone, contract ID, Lucky ID, batch, KYC, customer name, direct sale ref...
```

## Admin Workflow

Admin can use **`/admin/collections`** (collections workspace includes the universal search panel at the top) or **`/admin/finance/collect`** (full payment collection desk with the same search).

1. Search by phone, reference, Lucky ID, batch, customer, customer id, KYC-safe customer code, or sale reference.
2. Review normalized receivable results.
3. Use enabled actions only:
   - `ADVANCE_EMI`: opens the existing EMI collection form with subscription context.
   - `DIRECT_SALE`: opens the existing direct-sale collection form when the direct-sale service reports a collectable balance.
4. Rent and lease results remain visible but collection is disabled until a production-safe rent/lease posting path exists.

## Cashier Workflow

Cashier uses `/cashier/collect`.

1. Search universal references within cashier branch scope.
2. Verify customer, masked phone, reference number, contract type, product summary, due amount, overdue amount, next due date, and status.
3. For Advance EMI, use the existing cashier EMI queue selection and collection form.
4. For supported direct-sale receivables, open the existing direct-sale collection panel.
5. Disabled actions are shown as disabled with the backend reason.

Cashier search must not expose admin-only snapshots, raw KYC values, unrestricted partner data, or records outside assigned branch scope.

## Normalized Result

The API returns:

```json
{
  "source_type": "ADVANCE_EMI",
  "source_id": 1,
  "reference_no": "SUB/ADVEMI/BATCH/L01/2026/00001",
  "display_reference": "SUB/ADVEMI/BATCH/L01/2026/00001",
  "customer_id": 1,
  "customer_name": "Customer Name",
  "phone_masked": "******1234",
  "product_summary": "Product summary",
  "due_amount": "0.00",
  "overdue_amount": "0.00",
  "next_due_date": null,
  "status": "PENDING",
  "allowed_actions": ["COLLECT_EMI"],
  "disabled_reason": null
}
```

`due_amount`, `overdue_amount`, `next_due_date`, and `allowed_actions` are derived from source billing/payment services, not from `ContractReference`.

## Limitations

- Rent and lease collection actions are disabled in Phase 9A.
- Direct-sale collection is available only when the existing direct-sale collection service can safely post against the receivable.
- The workflow does not add AI access to customer or contract private data.

