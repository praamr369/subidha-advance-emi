# Customer Account Statement Print Document

Status: **Phase 4C implemented on `update` branch**

Route:

```text
/admin/customers/[id]/statement/print
```

Route helper:

```text
buildAdminCustomerAccountStatementPrintRoute(id, params)
```

UI entry point:

```text
/admin/customers/:id
```

The customer detail header/action strip exposes:

```text
Customer Account Statement PDF / Print
```

## Purpose

This print route is a read-only customer account summary/evidence document. It is not a customer ledger engine, settlement engine, accounting voucher, reconciliation report, or account-health engine.

## Data sources

The page uses existing read contracts only:

```text
GET /admin/customers/:id/
GET /admin/payments/?customer=:id
GET /admin/subscriptions/?customer=:id
```

If the subscription customer filter is unavailable, subscription search may be used only as candidate retrieval. Candidate rows are displayed only when backend-exposed customer identity clearly matches the selected customer.

## Displayed customer fields

The customer section displays backend-exposed identity and status fields only:

- customer id.
- customer code when exposed.
- name.
- phone.
- email.
- address/city.
- backend customer status.
- backend KYC status.

Unsafe/inactive warning is displayed only when the backend customer payload exposes an inactive, blocked, suspended, defaulted, or closed status.

## Displayed subscription fields

The subscription/contract section displays backend-exposed contract fields only:

- subscription reference.
- plan type.
- product name/code.
- batch code.
- lucky ID / lucky number.
- backend status.
- tenure.
- monthly amount.
- total amount.
- backend `financial_summary` fields when present.

## Displayed payment fields

The payment/receipt section displays backend-exposed collection fields only:

- payment reference.
- receipt reference when exposed.
- date.
- source/module/reference when exposed.
- method.
- backend amount.
- backend status or reversal state.

`total_paid_amount` is displayed only if the payments API response explicitly exposes that field.

## Limitations

The print page does not calculate:

- running balance.
- total outstanding.
- total due.
- EMI balance.
- direct-sale balance.
- rent/lease balance.
- waiver amount.
- customer account health.
- customer risk.
- combined customer ledger total.

Missing optional display values use `—`. Missing amount values are not converted to inferred zero.

## Deferred until backend statement ledger exists

The following fields remain deferred until backend statement/ledger contracts expose them directly:

- backend customer ledger rows.
- backend total outstanding.
- backend direct-sale receivable rows.
- backend rent/lease due rows.
- backend running balance.
- backend customer account health/risk state.

## Integrity preservation

The route is read-only and calls no mutation endpoints. It does not mutate customer, payment, receipt, EMI, subscription, direct-sale, rent/lease, accounting, reconciliation, settlement, commission, payout, inventory, source lifecycle, or audit records.

## Test coverage

Deterministic Playwright smoke:

```text
frontend/tests/e2e/customer_account_statement_print_smoke.spec.ts
```

Coverage includes:

- business name.
- document title.
- customer identity fields.
- subscription section.
- payment section.
- backend-reported amount display.
- no frontend running-balance generation.
- warning text for no frontend balance calculation.
- audit footer.
- signature blocks.
- print toolbar screen visibility.
- print toolbar hidden under print media.
- screen-only navigation hidden under print media.
- no dashboard chrome on print route.
- customer detail print-link exposure.
