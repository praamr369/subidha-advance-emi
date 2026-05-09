# Delivery Manage History-Only Policy

## Purpose
Protect direct-sale delivery history when the source sale is reversed, returned, cancelled, or archived.

## History-Only Trigger
A direct-sale delivery case must be treated as read-only when:
- `source_reversed=true` or `history_only=true`
- `source_status` is terminal (`REVERSED_POST_INVOICE`, `RETURNED`, `ARCHIVED`, `CANCELLED_AFTER_DELIVERY`, `CANCELLED_PRE_INVOICE`)
- return lifecycle is complete (`return_pickup_completed=true` or stock return signal is posted)

## Required UI Behavior
- Hide active mutation actions (assign/reschedule/dispatch/deliver/cancel/process-normal-delivery actions).
- Keep audit/history/documents visible.
- Show badges: `Source reversed`, `Returned to stock`, `History only`, `No action required`.
- Show info copy:
  - `Original delivery is preserved for history. The source sale has been reversed.`
  - `Product return is already posted to stock.` (when applicable)
- Keep contextual links visible:
  - Direct Sale
  - Reversal
  - Stock Ledger
  - Documents

## Backend Contract (Read-only)
- Delivery payload exposes read-only source flags and status.
- Additive read-only stock return status may be included for UI state (`SALE_RETURN_IN_POSTED` style values).
- No posting, reversal, stock, payment, or accounting mutation logic changes.
