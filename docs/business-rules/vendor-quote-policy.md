# Vendor quote policy

## Scope

Supports furniture procurement negotiations while keeping **financial posting** untouched. RFQs, `VendorQuoteRequest`, and `VendorQuote` rows are operational documents only unless explicitly converted elsewhere.

## Roles

| Role | Access |
| --- | --- |
| **Admin / vendor.manage capability** | Full RFQ lifecycle, vendor catalog maintenance, sourcing hints, ledger visibility unchanged from earlier phases |
| **Vendor portal (`VENDOR` role + linked `Vendor`)** | Sees only RFQs referencing their stubs; may update their own stub while RFQ remains open |

## Lifecycle rules

1. **`request_no` uniqueness**: Issued centrally through **`DocumentSequence` (`VENDOR_QUOTE_REQUEST`)** to avoid clashes and align with numbering governance.
2. **One stub per vendor per RFQ**: Enforced via DB unique constraint on `(quote_request, vendor)`; prevents duplicate bids from the same supplier.
3. **Draft secrecy**: **`DRAFT`** RFQs remain internal—vendors neither list nor GET them.
4. **Accept vs reject**:
   - Accept moves the winning stub to **`ACCEPTED`**, competing `REQUESTED`/`QUOTED` rows to **`REJECTED`**, and the RFQ to **`CLOSED`**.
   - Reject removes a **`QUOTED`** candidate while leaving other quotes intact unless staff close the RFQ separately.
5. **No downstream automation**: Acceptance **must not** create `PurchaseBill`, `VendorPayment`, stock ledger rows, EMI schedules, reconciliation entries, payout batches, waiver postings, refund receipts, or lucky-draw side effects inside this workflow.

## Data vs accounting

Outstanding vendor payables (`vendor_ledger_service`) and purchase visibility remain authoritative for money movement; quote amounts are indicative until mirrored on approved procurement documents initiated outside this API surface.
