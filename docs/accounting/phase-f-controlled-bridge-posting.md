# Phase F — Controlled Accounting Bridge Posting

This document records the controlled accounting bridge posting contract for SUBIDHA CORE.

## Phase F baseline — Payment bridge posting

The first controlled slice supports concrete `Payment` source items for `subscription_emi_payment`.

Rules:

- preview is read-only
- posting is explicit and admin-only
- posting is idempotent by source/event/idempotency key
- posting creates `JournalEntry`, `AccountingBridgePosting`, and a pending `ReconciliationItem`
- posted/unverified rows are not marked reconciled automatically
- abstract readiness rows are never postable
- Staff Advance remains unsupported

## Phase F2 — ReceiptDocument bridge posting

Phase F2 extends the same controlled bridge workflow to concrete `ReceiptDocument` source items only.

Supported source model:

```text
ReceiptDocument
```

Supported event keys:

```text
direct_sale_receipt
customer_advance
customer_refund
refund_customer_credit
```

Current safe classification:

- `direct_sale_receipt` is used for retail receipt documents tied to direct-sale source posture.
- `customer_advance` is used for manual/unapplied retail receipt documents that are not tied to a direct sale, invoice, or Payment.
- `refund_customer_credit` is reserved for note-adjustment style receipt documents where the current data shape supports it.
- EMI payment receipts are skipped because the concrete `Payment` candidate remains the authoritative EMI posting source.
- Cancelled or voided receipts are skipped. Void/reversal posting is not included in Phase F2.
- Unsupported receipt shapes remain non-postable.

## Phase F3 — BillingInvoice bridge posting

Phase F3 extends the controlled bridge workflow to concrete `BillingInvoice` source items only.

Supported source model:

```text
BillingInvoice
```

Supported event keys:

```text
direct_sale_invoice
direct_sale_outstanding
```

Current safe classification:

- `direct_sale_invoice` is used only when the concrete source record is `BillingInvoice` and its source posture is direct sale.
- `direct_sale_outstanding` is allowed only when the concrete source record is `BillingInvoice` and the invoice has an outstanding receivable posture.
- Draft, cancelled, and voided invoices are skipped as not applicable.
- Proforma, demand note, subscription, rent/lease, and deposit/liability shapes are unsupported until a later phase defines their accounting treatment.
- BillingInvoice posting resolves receivable, sales revenue, and output GST accounts from active posting profiles/canonical chart accounts. Missing receivable, revenue, tax, period, or journal numbering setup blocks posting with an exact reason.

## Phase F4 — Credit Note / Sales Return bridge posting

Phase F4 extends the controlled bridge workflow to concrete credit-note and return source records only.

Supported source models:

```text
BillingCreditNote
DirectSaleReturn
```

Supported event keys:

```text
credit_note_issue
sales_return
customer_credit_adjustment
direct_sale_return
```

Current safe classification:

- `credit_note_issue` is used for approved concrete `BillingCreditNote` records without stock-return posture.
- `sales_return` is used for approved concrete `BillingCreditNote` records that represent stock-effect or direct-sale-return posture.
- `customer_credit_adjustment` is reserved for concrete credit-note shapes where the source clearly represents customer credit adjustment.
- `direct_sale_return` is used only when the concrete source record is `DirectSaleReturn`.
- Draft, cancelled, and voided credit notes are skipped as not applicable.
- Cancelled DirectSaleReturn rows are skipped. DirectSaleReturn rows that require approval remain blocked by approval and are not postable.
- Unsupported credit/return shapes remain visible and non-postable.

Accounting shape:

- Debit `SALES_RETURNS` for taxable sales-return / credit-note adjustment value.
- Debit `OUTPUT_GST` only when the concrete source has a tax reversal amount and the active chart/posting setup supports output-GST reversal.
- Credit `CUSTOMER_RECEIVABLE` for the full customer receivable reduction.

Tax reversal is not guessed. If `OUTPUT_GST` cannot be resolved for a taxable credit/return source, the candidate is blocked by mapping and cannot post.

## Phase F5 — BillingDebitNote bridge posting

Phase F5 extends the controlled bridge workflow to concrete debit-note source records only.

Supported source model:

```text
BillingDebitNote
```

Supported event keys:

```text
debit_note_issue
customer_debit_adjustment
damage_recovery
additional_receivable_adjustment
```

Current safe classification:

- `debit_note_issue` is the default event for approved concrete `BillingDebitNote` records.
- `damage_recovery` is used only when the concrete `BillingDebitNote` reason indicates damage/recovery posture.
- `customer_debit_adjustment` is used only when the concrete `BillingDebitNote` reason indicates adjustment posture.
- `additional_receivable_adjustment` is used only when the concrete `BillingDebitNote` reason indicates additional/extra receivable posture.
- Draft, cancelled, and voided debit notes are skipped as not applicable.
- Unsupported debit-note shapes remain visible and non-postable.

Accounting shape:

- Debit `CUSTOMER_RECEIVABLE` for the full debit-note receivable increase.
- Credit `DIRECT_SALE_INCOME` / `SALES_REVENUE` / mapped adjustment income for the taxable adjustment value.
- Credit `OUTPUT_GST` only when the concrete source has a tax amount and the active chart/posting setup supports output-GST posting.

Tax posting is not guessed. If `OUTPUT_GST` cannot be resolved for a taxable debit-note source, the candidate is blocked by mapping and cannot post.

## Phase F6 — PurchaseBill / Vendor Payable bridge posting

Phase F6 extends the controlled bridge workflow to concrete `PurchaseBill` source records only.

Supported source model:

```text
PurchaseBill
```

Supported event keys:

```text
purchase_bill_accrual
vendor_payable_invoice
input_tax_credit
purchase_expense_accrual
```

Current safe classification:

- `purchase_bill_accrual` is the default event for approved concrete `PurchaseBill` records.
- Draft and cancelled purchase bills are skipped as not applicable.
- Legacy `PurchaseBill.status=POSTED` rows that were processed by the old inventory stock service are not made bridge-postable unless an accounting bridge posting already exists, because the legacy path may have mutated stock/status/journal state.
- Unsupported purchase bill shapes remain visible and non-postable.

Accounting shape:

- Debit `PURCHASE_EXPENSE` / `PURCHASE_CLEARING` / `INVENTORY_CLEARING` for the taxable purchase value.
- Debit `INPUT_GST` only when the concrete source has tax and active setup supports input GST.
- Credit `VENDOR_PAYABLE` / `ACCOUNTS_PAYABLE` for the full payable amount.

Inventory boundary:

- F6 does not create or mutate `StockLedger`.
- F6 does not update `InventoryItem`, stock quantity, stock valuation, delivery demand, or COGS.
- F6 does not call the legacy `post_purchase_bill` inventory service.

Tax posting is not guessed. If `INPUT_GST` cannot be resolved for a taxable purchase bill, the candidate is blocked by mapping and cannot post.

## Phase F7 — VendorPayment / payable settlement bridge posting

Phase F7 extends the controlled bridge workflow to concrete `inventory.VendorPayment` source records only.

Actual source model used:

```text
VendorPayment
```

Supported event keys:

```text
vendor_payment
purchase_bill_payment
vendor_payable_settlement
accounts_payable_payment
supplier_payment
```

Current safe classification:

- `vendor_payment` is used for concrete `VendorPayment` records not linked to a purchase bill.
- `purchase_bill_payment` is used for concrete `VendorPayment` records linked to a vendor bill / purchase bill record.
- Cancelled vendor payments are skipped as not applicable.
- Legacy `VendorPayment.status=POSTED` rows without an `AccountingBridgePosting` are skipped because the legacy vendor payment posting path may already have mutated source status, posted journal references, or vendor ledger evidence.
- Unsupported vendor payment shapes remain visible and non-postable.

Accounting shape:

- Debit `VENDOR_PAYABLE` / `ACCOUNTS_PAYABLE` for the paid amount.
- Credit the concrete `FinanceAccount.chart_account` used by the vendor payment.

Safety boundary:

- Preview is read-only and does not consume `JOURNAL_ENTRY` numbering.
- Posting is explicit, admin-only, transactional, and idempotent.
- Posting creates `JournalEntry`, `AccountingBridgePosting`, and a pending `ReconciliationItem`.
- Posting does not mutate `VendorPayment`, `PurchaseBill`, `StockLedger`, or `InventoryItem`.
- Posting does not create inventory valuation, COGS, purchase-return, commission, payroll, staff-advance, rent, or lease accounting.
- Reconciliation remains pending until explicit verification.

## Phase F8 — StockLedger inventory asset bridge posting

Phase F8 extends the controlled bridge workflow to concrete `StockLedger` rows for inventory asset, clearing, adjustment, writeoff, and return movements.

Supported source model:

```text
StockLedger
```

Supported event keys:

```text
inventory_purchase_receive
inventory_adjustment_increase
inventory_adjustment_decrease
inventory_writeoff
inventory_return_in
inventory_return_out
```

Sale/delivery stock-out rows were intentionally deferred in F8 because the `StockLedger` row itself does not store reliable COGS value.

Safety boundary:

- F8 does not mutate `StockLedger`.
- F8 does not mutate `InventoryItem`, stock quantity, or stock valuation.
- F8 does not create stock movements or recalculate valuation.
- Transfer rows are skipped as not applicable.
- Unsupported rows remain visible and non-postable.

## Phase F9 — Controlled COGS / sale stock-out bridge posting

Phase F9 extends the same controlled bridge workflow to COGS-style accounting for existing finalized sale/delivery `StockLedger` stock-out rows only.

Supported source model:

```text
StockLedger
```

Supported COGS event keys:

```text
cogs_sale_delivery
cogs_direct_sale_delivery
cogs_subscription_delivery
inventory_sale_stock_out
```

Eligibility is intentionally narrow:

- the row must be a concrete `StockLedger` row
- movement must be a physical finalized stock-out: `SALE_OUT`, `EMI_DELIVERY_OUT`, or `DELIVERY_OUT`
- source metadata must link to a supported finalized sale/delivery source such as `BillingInvoiceLine`, `DirectSaleLine`, or `SubscriptionDelivery`
- the linked source snapshot must contain persisted cost evidence such as `cogs_unit_cost`, `cogs_amount`, `unit_cost_snapshot`, or `valuation_amount_snapshot`
- the amount must be positive and balanced
- the same source/event must not already be posted
- the accounting period and `JOURNAL_ENTRY` numbering must be ready
- COGS and Inventory Asset mappings must be active

Accounting shape:

- Debit `COGS` / `COST_OF_GOODS_SOLD`
- Credit `INVENTORY_ASSET`

Deferred / unsupported behavior:

- Missing, ambiguous, zero, or guessed cost returns a non-postable `deferred_cogs` candidate.
- Stock-out rows whose source cannot prove finalized sale/delivery return unsupported/deferred status and are not postable.
- F9 never derives cost from live inventory state or current product cost as a guess.

Safety boundary:

- F9 does not mutate `StockLedger`.
- F9 does not mutate `InventoryItem`, stock quantity, or valuation.
- F9 does not mutate `BillingInvoice`, `DirectSale`, `SubscriptionDelivery`, `PurchaseBill`, or `VendorPayment`.
- F9 does not create/delete stock movements, recalculate valuation, auto-post, auto-reconcile, or close periods.
- F9 does not add rent/lease revenue, commission, payroll, or StaffAdvance posting.

Reconciliation diagnostics now include ready unposted COGS candidates, posted-unverified COGS postings, amount/period/source/journal/duplicate mismatches through the existing bridge checks, and explicit `DEFERRED_COGS` / `UNSUPPORTED_SOURCE` items for non-postable stock-out rows.

## Preview contract

Preview endpoint:

```http
GET /api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/preview/
```

Preview must remain read-only. It must not create:

- `JournalEntry`
- `AccountingBridgePosting`
- `ReconciliationItem`
- document numbers
- source Payment, ReceiptDocument, BillingInvoice, BillingCreditNote, BillingDebitNote, PurchaseBill, VendorPayment, or DirectSaleReturn mutations
- StockLedger or inventory valuation mutations

Preview returns the concrete source identity, journal-date context, accounting period, journal-number preview, debit lines, credit lines, tax lines where supported, totals, blockers, warnings, idempotency key, and safety copy. For `StockLedger`, preview also returns movement type/date, item/product, stock location/branch, quantity, unit cost where safely resolved, amount/value, source reference, and COGS amount/state when applicable.

## Posting contract

Post endpoint:

```http
POST /api/v1/admin/accounting/bridge-reconciliation/candidates/{candidate_id}/post/
```

Posting is:

- admin-only
- explicit confirmation only
- transactional
- idempotent per concrete source + event key + idempotency key
- tied to a concrete source record

Posting creates:

- one posted `JournalEntry`
- one `AccountingBridgePosting`
- one pending/unverified `ReconciliationItem`

Posting does not mutate original source financial fields. In particular, this bridge workflow does not set `posted_journal_entry` on billing, purchase, or stock ledger source records and does not change amount, status, document number, source reference, tax values, invoice/receipt allocation, DirectSale, Payment, EMI, Subscription, StockLedger, InventoryItem, PurchaseBill, VendorPayment, Commission, Payout, Delivery, stock quantity, stock valuation, or rent/lease source data.

## Reconciliation contract

After posting, the row remains pending/unverified until explicit reconciliation verification.

Verification endpoint:

```http
POST /api/v1/admin/accounting/bridge-reconciliation/items/{id}/verify/
```

Verification is admin-only and applies only to clean `POSTED_UNVERIFIED` bridge reconciliation items. It does not mutate the source record.

## Period close impact

Bridge rows follow the same close posture across Payment, ReceiptDocument, BillingInvoice, BillingCreditNote, DirectSaleReturn, BillingDebitNote, PurchaseBill, VendorPayment, and StockLedger:

- ready/unposted concrete rows block close as unposted bridge work
- posted/unverified rows block close as unreconciled work
- verified/reconciled rows no longer block close as unreconciled
- unsupported source shapes remain visible and non-postable

## Phase F8 — StockLedger / inventory accounting bridge

Phase F8 extends the controlled bridge workflow to concrete existing `StockLedger` rows only.

Actual source model used:

```text
StockLedger
```

Supported event keys:

```text
inventory_purchase_receive
inventory_adjustment_increase
inventory_adjustment_decrease
inventory_transfer_in
inventory_transfer_out
inventory_writeoff
inventory_return_in
inventory_return_out
```

Current safe classification:

- `PURCHASE_IN` / `PURCHASE_RECEIVE` can become `inventory_purchase_receive` only when source cost can be resolved from a concrete receipt/bill line.
- `ADJUSTMENT_IN` becomes `inventory_adjustment_increase` only when `StockAdjustmentLine` cost snapshots exist.
- `ADJUSTMENT_OUT` becomes `inventory_adjustment_decrease` only when `StockAdjustmentLine` cost snapshots exist.
- `DAMAGE` is classified as `inventory_writeoff`, but it remains blocked if no reliable source valuation exists.
- same-entity transfers are `SKIPPED_NOT_APPLICABLE`; they are not posted.
- sale, delivery, EMI delivery, and other COGS-like movements are `UNSUPPORTED_SOURCE` / deferred COGS unless the existing movement type and source metadata safely support a finalized sale/delivery cost event.
- unsupported movement types remain visible and non-postable.

Accounting shapes:

- `inventory_purchase_receive`: debit `INVENTORY_ASSET`, credit `PURCHASE_CLEARING` / `INVENTORY_CLEARING`.
- `inventory_adjustment_increase`: debit `INVENTORY_ASSET`, credit inventory adjustment gain/income/clearing account.
- `inventory_adjustment_decrease`: debit inventory adjustment loss/expense account, credit `INVENTORY_ASSET`.
- `inventory_writeoff`: debit inventory writeoff/stock loss account, credit `INVENTORY_ASSET`.

Safety boundary:

- F8 creates accounting bridge entries from existing `StockLedger` rows only.
- F8 does not create, edit, reverse, delete, or recalculate stock movements.
- F8 does not mutate `StockLedger`, `InventoryItem`, stock quantity, stock valuation/cost, `PurchaseBill`, or `VendorPayment`.
- F8 does not call legacy purchase posting or inventory receipt/delivery logic.
- F8 does not add purchase bill, vendor payment, purchase return, manufacturing/BOM, commission, payroll, rent/lease, staff advance, or COGS posting beyond the explicitly supported StockLedger accounting shapes above.
- COGS is deferred until a later sub-phase defines a finalized sale/delivery cost source contract.

## Safety limits

The controlled bridge still does not add posting for:

- DirectSale sale source records
- Rent/Lease source records
- GoodsReceipt
- VendorSettlement
- Purchase return
- Commission or payout

## Phase F10 — Commission accrual accounting bridge

Phase F10 extends the controlled bridge workflow to concrete commission accrual source records only.

Actual source model used:

```text
subscriptions.Commission
```

Supported event keys:

```text
commission_accrual
partner_commission_accrual
sales_commission_accrual
```

Current safe classification:

- `commission_accrual` is the default event for concrete `Commission` records with `status=PENDING` and positive `commission_amount`.
- `Commission.status=SETTLED` is treated as legacy paid/settled commission and skipped as not applicable for F10 accrual posting.
- `Commission.status=REVERSED` is skipped as not applicable.
- zero, negative, unknown, or ambiguous commission rows remain unsupported and non-postable.
- The current `Commission` model has no separate approved/earned fields, so F10 does not invent an approval state.

Accounting shape:

- Debit `COMMISSION_EXPENSE`.
- Credit `COMMISSION_PAYABLE`.

Safety boundary:

- Preview is read-only and does not consume `JOURNAL_ENTRY` numbering.
- Posting is explicit, admin-only, transactional, and idempotent by source/event/idempotency key.
- Posting creates `JournalEntry`, `AccountingBridgePosting`, and a pending `ReconciliationItem`.
- Posting does not mutate `Commission` amount, status, source links, metadata, settlement date, or reversal fields.
- Posting does not create or mutate `CommissionPayoutBatch` or `CommissionPayoutLine`.
- Posting does not mark commission paid or settled.
- Reconciliation remains pending until explicit verification.
- Commission payout / settlement posting is deferred to Phase F11.
- Salary, payroll, or StaffAdvance
- Inventory valuation or COGS

Do not auto-post, auto-reconcile, auto-close periods, create fake mappings, mutate inventory, or fake Staff Advance readiness.

## Phase F12 — Payroll / salary accrual accounting bridge

Phase F12 extends the controlled bridge workflow to concrete payroll accrual source records only.

Actual source model used:

```text
accounting.SalarySheet
```

Supported event keys:

```text
salary_accrual
```

Accepted aliases remain reserved for source-backed payroll accrual rows only:

```text
payroll_accrual
staff_salary_accrual
wages_accrual
```

Current safe classification:

- `salary_accrual` is used only for concrete `SalarySheet` rows with `status=APPROVED`, a linked `PayrollPeriod`, a reliable payroll-period end date, positive `gross_amount`, positive `net_amount`, and no deductions.
- `SalarySheet.status=DRAFT` is blocked by approval/finalization.
- `SalarySheet.status=POSTED`, `PAID_PARTIAL`, or `PAID` is skipped as not applicable because the legacy salary workflow may already have posted or paid it.
- Salary sheets with deductions are unsupported in F12 until deduction/tax/PF/ESI clearing mappings are explicitly defined.
- Salary sheets without a reliable payroll-period end date are non-postable.

Accounting shape:

- Debit `SALARY_EXPENSE` / `WAGES_EXPENSE`.
- Credit `SALARY_PAYABLE`.

Safety boundary:

- Preview is read-only and does not create `JournalEntry`, `AccountingBridgePosting`, `ReconciliationItem`, salary payment rows, payroll source changes, staff changes, attendance changes, StaffAdvance changes, or payment changes.
- Preview does not consume `JOURNAL_ENTRY` numbering.
- Posting is explicit, admin-only, transactional, and idempotent by concrete `SalarySheet` source/event/idempotency key.
- Posting creates accounting entries only: one posted `JournalEntry`, one `AccountingBridgePosting`, and one pending `ReconciliationItem`.
- Posting does not change `SalarySheet.status`, `gross_amount`, `deductions_amount`, `net_amount`, or `posted_journal_entry`.
- Posting does not edit `EmployeeProfile`, staff payroll configuration, attendance rows, payroll periods, StaffAdvance records, or payment records.
- Posting does not create salary payment/settlement records.
- Reconciliation remains pending until explicit verification.

Deferred to Phase F13:

```text
Dr Salary Payable
Cr Cash / Bank / FinanceAccount
```

F12 must not post salary payment, payroll payout, StaffAdvance, commission, payout, inventory, COGS, rent, lease, auto-posting, auto-reconciliation, or period close.

## Phase F14 — Rent/lease monthly revenue recognition bridge

Phase F14 extends the controlled bridge workflow to concrete monthly rent/lease billing demand records only.

Actual source model used:

```text
subscriptions.RentLeaseBillingDemand
```

Supported event keys:

```text
rent_monthly_revenue
lease_monthly_revenue
```

Accepted aliases remain reserved for source-backed rent/lease invoice revenue rows only:

```text
rent_invoice_revenue
lease_invoice_revenue
rent_lease_invoice_revenue
```

Current safe classification:

- `rent_monthly_revenue` is used only for `RentLeaseBillingDemand.demand_type=RENT_MONTHLY` linked to a `Subscription.plan_type=RENT`.
- `lease_monthly_revenue` is used only for `RentLeaseBillingDemand.demand_type=LEASE_MONTHLY` linked to a `Subscription.plan_type=LEASE`.
- `reference_key` is the invoice-like reference because the current concrete demand source has no separate invoice number field.
- `due_date` is the source event date; `billing_period_start` / `billing_period_end` provide the service period.
- `SECURITY_DEPOSIT`, `CANCELLED`, and `WAIVED` demands are skipped as not applicable.
- Ambiguous demand type / plan type combinations remain unsupported and non-postable.
- Positive source amount, open accounting period, journal numbering, receivable mapping, rent/lease revenue mapping, and output GST mapping when explicit tax exists are required before posting.

Accounting shape:

- Rent: debit `CUSTOMER_RECEIVABLE`; credit `RENT_INCOME`.
- Lease: debit `CUSTOMER_RECEIVABLE`; credit `LEASE_INCOME`.
- Credit `OUTPUT_GST` only when the concrete demand snapshot/metadata contains an explicit tax amount.

Safety boundary:

- Preview is read-only and does not create `JournalEntry`, `AccountingBridgePosting`, or `ReconciliationItem`.
- Preview does not consume `JOURNAL_ENTRY` numbering.
- Posting is explicit, admin-only, transactional, and idempotent by concrete demand source/event/idempotency key.
- Posting creates accounting entries only: one posted `JournalEntry`, one `AccountingBridgePosting`, and one pending `ReconciliationItem`.
- Posting does not mutate `RentLeaseBillingDemand`, `Subscription`, rent/lease contract profile, payment/receipt records, or security deposit records.
- Posting does not mark a demand paid, revenue-recognized, reconciled, or closed.
- Reconciliation remains pending until explicit verification.

Deferred to later phases:

```text
rent/lease payment settlement
security deposit receipt
security deposit refund
customer advance
direct sale revenue
lucky EMI revenue
COGS
payroll
commission
inventory
vendor/purchase posting
```

F14 must not auto-post, auto-reconcile, auto-close periods, post collections, post deposits, mutate invoices/contracts/payments/receipts/deposits, or weaken earlier Phase F slices.

## Phase F15A — Accounting setup/action-link hardening

Bridge candidates and readiness screens now route operators to concrete setup pages:

- Chart of Accounts: `/admin/accounting/chart-of-accounts`
- Finance Accounts: `/admin/settings/business-setup/finance-accounts`
- Mapping Audit: `/admin/accounting/setup/mapping-audit`
- Accounting Periods: `/admin/accounting/periods`
- Journal Entries: `/admin/accounting/journals`
- Reconciliation Runs: `/admin/reconciliation/runs`
- Bridge Posting: `/admin/accounting/bridge-reconciliation`
- Journal Numbering: `/admin/settings/business-setup/document-numbering`

Finance-account blockers are classified separately from generic mapping blockers. Missing, inactive, or unmapped concrete collection accounts should route staff to Finance Accounts first. Missing receivable/revenue/payable chart or posting profile setup remains a mapping/COA blocker.

Refresh and diagnostics remain read-only. They must not post journals, reconcile items, close periods, create payment records, or mutate source records.

## Phase F15 — Rent/lease payment settlement bridge status

F15 cannot safely start from the current repository state because there is no concrete rent/lease payment settlement source model.

Confirmed current source shape:

- Monthly rent/lease collection is recorded by `subscriptions.services.rent_lease_collection_workflow_service.collect_rent_lease_monthly_demand`.
- That workflow mutates `RentLeaseBillingDemand.collected_amount` and `status`.
- It writes collection metadata into an audit event only.
- Its module docstring explicitly states it does not create `Payment`, `ReceiptDocument`, `JournalEntry`, `MoneyMovement`, `SettlementAllocation`, or `ReconciliationItem` rows.
- Security deposit collection creates `RentLeaseDepositTransaction`, but deposit receipt/refund posting is outside F15.

Unsupported for F15 posting:

- `RentLeaseBillingDemand` as a settlement source, because F14 already uses it for revenue and its collection state is an aggregate demand mutation, not a concrete settlement row.
- `AuditLog` collection metadata as a settlement source, because it is not a payment/collection source model and does not provide a hardened finance settlement contract.
- `RentLeaseDepositTransaction`, because deposits and refunds remain separate phases.

Required future source before F15 can post:

```text
Dr concrete payment FinanceAccount.chart_account
Cr Customer Receivable / Rent-Lease Receivable
```

The future source must persist, at minimum, source primary key, receipt/payment number, payment date, customer/party, linked demand/contract, `plan_type` RENT/LEASE evidence, positive amount, payment method, concrete `finance_account`, status, cancellation/void/reversal posture, and existing journal/bridge evidence.

Until that exists, rent/lease payment settlement counters remain zero and the UI must not expose a Post button for F15 settlement.

F15 safety boundary:

- no payment/receipt mutation
- no rent/lease demand mutation
- no subscription/contract mutation
- no customer/party mutation
- no security deposit mutation
- no finance-account mutation
- no demand paid/contract paid mutation
- no payment/receipt/deposit/refund record creation
- no auto-post, auto-reconcile, or auto-close

F16 security deposit posting should not start until a concrete deposit receipt/refund source contract is defined separately from `RentLeaseDepositTransaction` history, or the existing transaction model is explicitly hardened as the authoritative deposit settlement source.
