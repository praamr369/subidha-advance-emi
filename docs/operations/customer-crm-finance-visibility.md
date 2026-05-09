# Customer CRM Finance Visibility

## Active vs Historical Customer Finance
- Cancelled subscriptions are preserved in history and excluded from active contract value and active dues.
- Returned/reversed/archived direct sales are preserved in history and excluded from active direct-sale outstanding.
- Reversed payments remain visible in payment history and are excluded from active payment counts and active collected amount.

## Customer List Rules
- `active_subscription_count`, `active_contract_value`, and `active_subscription_due` represent operationally active contracts only.
- Historical contract counts and cancelled counts are exposed separately and must not be rendered as active KPIs.
- Active receivable values (`active_direct_sale_outstanding`, `active_invoice_outstanding`) exclude history-only records.
- Historical contract value is computed once per subscription contract, never multiplied through EMI-row joins.
- Cancelled subscription EMI rows remain visible in history, but they are excluded from active overdue and active due signals.

## Customer Detail Rules
- KPI cards must label active vs historical values explicitly.
- Direct-sale history can show full historical totals while active outstanding remains zero for returned/reversed records.
- Linked subscriptions must separate active rows from history rows; history rows are view-only for collection context.
- Customer hover/list/detail/CRM preview must share the same backend summary fields for active-vs-history parity.
- Cancelled-only customers should show history posture (`CANCELLED`/`HISTORY`) and no active collect CTA.

## No-Deletion Safety
- No subscription, direct sale, invoice, receipt, payment, journal, stock ledger, or audit records are deleted for visibility corrections.
- Changes are read/visibility filters and serializer/UI field separation only.
