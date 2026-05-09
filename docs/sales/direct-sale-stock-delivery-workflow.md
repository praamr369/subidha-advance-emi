# Direct sale · stock · delivery workflow

## APIs

- Billing remains canonical for receipts/payments: `/api/v1/billing/direct-sales/`.
- Operational orchestration (additive): `/api/v1/admin/sales/direct-sales/` (`GET` list, `POST` create, `GET/:id` detail) wraps the existing `create_direct_sale` service—**no changes** to EMI posting, receipt posting, or commission logic.

## Composite POST response

```json
{
  "sale": { "...DirectSaleSerializer..." },
  "stock_status": "AVAILABLE | INSUFFICIENT | UNAVAILABLE | NOT_CONFIGURED",
  "stock_lines": [{ "line_id": 1, "stock_line_status": "...", "...": "..." }],
  "delivery_request": { "id": 123, "status": "OPEN", "...": "..." },
  "stock_need": { "need_no": "SN-...", "...": "..." },
  "stock_needs_open_count": 1,
  "warnings": []
}
```

## Flow summary

1. **Stock available** — Sale + invoice sync proceed as today; delivery desk cases advance toward dispatch-ready phases when payments clear business gates.
2. **Insufficient / unavailable** — Sale still persists (business-approved drafts); `_sync_direct_sale_purchase_needs` raises `PurchaseNeed` rows with factual shortages; delivery snapshot surfaces `STOCK_BLOCKED` phases without silently marking delivered or decrementing inventory below ATP rules.

## Frontend entry point

`/admin/sales/direct-sale/create` renders the billing workspace with `orchestrationCreate` enabled so admins immediately see stock status, desk linkage, and stock-need summaries after POST completes.
