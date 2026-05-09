# Vendor quote workflow

## Purpose

Admins circulate **supplier quote requests (RFQs)** so vendors submit commercial terms outside the EMI, payment, reconciliation, waiver, lucky draw, commission, and payout subsystems.

## Steps

1. **Create RFQ (`POST /api/v1/admin/vendor-quotes/requests/`)**
   - Choose `source_type`, optional linked `customer`, delivery geography hints, SKU label, quantities, budgets.
   - Select one or many **active vendors** (`vendor_ids`).
   - Toggle `send_to_vendors`:
     - `true` ⇒ status defaults to **SENT** and invited vendors immediately see invitations in `/api/v1/vendor/quote-requests/` (excluding `DRAFT` / `CANCELLED`).
     - `false` ⇒ status remains **DRAFT** until staff follow up elsewhere (no portal visibility yet).
   - Backend assigns **`request_no`** via `DocumentSequence` series `VENDOR_QUOTE_REQUEST` and creates **`VendorQuote` stubs** (`REQUESTED`).
2. **Vendor portal response (`POST /api/v1/vendor/quote-requests/{id}/quote/`)**
   - Linked vendor users update their stub (`QUOTED`) with pricing, MOQ equivalents, warranties, freight, validity, and notes while the RFQ stays `SENT` / `QUOTING` / `PARTIALLY_QUOTED`.
3. **Admin comparison (`GET /api/v1/admin/vendor-quotes/requests/{id}/`)**
   - All vendor rows are visible for comparison alongside metadata from the RFQ.
4. **Selection**
   - `POST /api/v1/admin/vendor-quotes/{id}/accept/` on a **`QUOTED`** row accepts it, rejects other open competitors, and closes the RFQ.
   - `POST .../reject/` rejects a **`QUOTED`** row individually when still comparing.
   - Acceptance returns `suggested_purchase_order_url` (UI hint only) pointing to **`/admin/purchases/orders?vendor_quote_id={id}`** so procurement continues manually.

## Operational guardrails

- Quote documents **never** enqueue purchase bills, stock movements, customer invoices, EMI schedules, payouts, commissions, refunds, reversals, or journals.
- Vendors cannot see **`DRAFT`** RFQs or another vendor's quote payloads (portal serializers filter `quotes`).
- Procurement must still authorize purchase orders/invoices according to standing finance controls.
