# History-only Delivery Cases

## What is history-only
A delivery row is history-only when the source direct sale is in reversed/returned/archived/cancelled terminal posture.

Current serialization logic:
- `billing/services/direct_sale_delivery_queue.py::serialize_direct_sale_delivery_case`
- `history_only = source_reversed or phase_code == "HISTORY_ONLY"`

## Expected behavior
- show row for audit/history visibility
- mark `history_only = true`
- keep source status visible
- disable active mutation actions
- keep links to source documents for traceability

For direct-sale history-only rows, current payload behavior:
- `action_endpoints` is empty
- return pickup flags indicate whether stock return is still pending or already posted

## UI behavior
Admin direct-sale delivery detail page and delivery register should:
- present clear history-only message
- hide or disable mutation actions
- avoid dead buttons
- route staff to reversal/stock/billing records for investigation

## Non-history-only cases
Normal active delivery rows continue to expose action endpoints and next-actions according to backend gates.

## Proposed future additive work (not implemented)
- Optional dedicated read-only tab aggregating all history-only delivery records across direct sale and EMI in one archive endpoint.
