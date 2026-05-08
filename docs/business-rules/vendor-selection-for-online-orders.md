# Vendor selection for online-directed purchases

## Principles

- **Admin-approved vendors only.** Ranking, RFQs, and acceptance remain operational choices carried out by authorised admin staff.
- **No automatic financial posting.** Selecting a vendor quote or drafting a purchase order must never trigger EMI movements, customer payments, reconciliation batches, bills payable posting, stock receipts, lucky-draw logic, commissions, or payouts unless handled through their dedicated workflows.
- **Customer privacy.** Vendor-visible RFQ payloads intentionally exclude full residential narratives stored on `CustomerPurchaseEnquiry.delivery_address`; vendors receive fulfilment geography (`customer_pincode`, city, district, state) consistent with Phase 3 portal serializers.

## Lifecycle mapping

| Stage | System behaviour |
| --- | --- |
| Capture | `CustomerPurchaseEnquiry` stores geography + SKU cues (+ optional `PublicLead` linkage). |
| Sourcing | Phase 4 scoring (`build_vendor_sourcing_for_enquiry`) is read-only ranking. |
| RFQ | `VendorQuoteRequest` rows use `source_type=ONLINE_ORDER` + `source_id=enquiry.pk`. |
| Selection | `select_vendor_quote_for_enquiry` wraps Phase 3 `accept_vendor_quote`. |
| Draft PO | Optional `create_draft_purchase_order_from_enquiry` requires `confirm=true`, inventory line inputs, and prior vendor quote acceptance—still **DRAFT** inventory status only. |

## Overrides

- **ACTIVE** vendors proceed by default.
- **ON_HOLD / BLOCKED** vendors require explicit API flags (`allow_on_hold_vendor`, `allow_blocked_vendor`) when accepting quotes—mirroring procurement governance expectations.

## References

- Workflow guide: [online-order-vendor-sourcing.md](../operations/online-order-vendor-sourcing.md)
