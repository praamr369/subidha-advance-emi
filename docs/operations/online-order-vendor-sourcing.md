# Online order → vendor sourcing workflow

## Scope

Connect future digital enquiry traffic with the Phase 4 sourcing engine and Phase 3 RFQ lifecycle without performing automated procurement or accounting.

## Actors

| Actor | Capabilities |
| --- | --- |
| Customer / visitor | POST `/api/v1/public/leads/` with `create_procurement_enquiry=true` **only** when `intent` is `DIRECT_SALE`, `QUOTATION`, or `ESTIMATE`. |
| Admin procurement | Full CRUD-ish operations against `/api/v1/admin/online-enquiries/…`. |
| Vendor portal | Continues to interact solely through `/api/v1/vendor/quote-requests/` scoped rows—never admin enquiry APIs. |

## Happy-path checklist

1. **Capture intent** — Public lead creates `CustomerPurchaseEnquiry` (linked via `public_lead_id`).
2. **Review enquiry** — `/admin/online-enquiries/<id>` summarises geography + SKU cues.
3. **Suggest vendors** — POST `…/suggest-vendors/` recomputes Phase 4 ranking (updates `NEW → SOURCING` when applicable).
4. **Optional deep dive** — Link **Open sourcing (prefilled)** hydrates `/admin/vendors/sourcing` query params for manual experimentation.
5. **Invite quotes** — POST `…/request-vendor-quotes/` with `{ vendor_ids: [], send_to_vendors: true|false }`.
6. **Vendor responds** — Standard vendor portal submission paths (`QUOTED`).
7. **Select winner** — POST `…/select-vendor-quote/` with `{ vendor_quote_id }` (+ optional override flags).
8. **Draft PO (optional)** — POST `…/create-purchase-draft/` with `{ confirm: true, inventory_item_id, quantity, unit_cost }` once status is `VENDOR_SELECTED`.

## Guardrails

| Topic | Rule |
| --- | --- |
| Accounting | No bills payable, journals, or settlements fire from these endpoints. |
| Inventory | Draft PO lines exist only after explicit confirmation—goods receipts remain manual. |
| Payments | Customer EMI/payment rails untouched. |
| Reporting | RFQs retain `ONLINE_ORDER` provenance for audits. |

## Failure modes

- Attempting procurement enquiry creation with `intent=GENERAL` returns HTTP 400 (`detail` explains requirement).
- Selecting quotes tied to another enquiry raises validation errors from the guard clause checking `source_type` + `source_id`.
- Draft PO creation without `confirm=true` aborts before touching inventory tables.

## References

- Policy: [vendor-selection-for-online-orders.md](../business-rules/vendor-selection-for-online-orders.md)
