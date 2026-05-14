# Delivery, Return, and Refund Workflow

## Admin delivery workspace
Primary endpoints:
- `GET/POST /api/v1/admin/deliveries/`
- `GET /api/v1/admin/deliveries/{id}/`
- `POST /api/v1/admin/deliveries/{id}/transition/`
- `POST /api/v1/admin/deliveries/{id}/mark-delivered/`
- `POST /api/v1/admin/deliveries/{id}/cancel/`
- `POST /api/v1/admin/deliveries/{id}/request-return/`
- `POST /api/v1/admin/deliveries/{id}/mark-returned/`

Direct-sale delivery case endpoints:
- `GET /api/v1/admin/deliveries/direct-sale-cases/{case_id}/`
- `POST .../schedule/`
- `POST .../dispatch/`
- `POST .../mark-delivered/`
- `POST .../cancel/`
- `POST .../approve-payment-exception/`

## Workflow: subscription delivery
1. Create delivery (`PENDING` or `SCHEDULED`).
2. Move through dispatch pipeline.
3. Mark delivered.
4. If possession reversal is needed, request return then mark returned.
5. Inventory bridge posts stock movement on delivered/returned when inventory bridge flags are enabled.

## Workflow: direct-sale delivery
1. Finalize/post invoice and satisfy gates (or explicitly approve payment exception).
2. Track operational state in direct-sale delivery case.
3. Schedule, dispatch, then mark delivered.
4. If source sale is reversed/cancelled/archived, case becomes history-only and active mutations are blocked.

## Workflow: return and refund
1. Create direct-sale return draft.
2. Approve return.
3. Post return (credit note and stock return movement where applicable).
4. If customer refund is required:
   - create refund draft
   - approve refund
   - pay refund (journal + customer credit ledger debit)

## Shop floor controls
- Cancel/void/refund requires reasons.
- Delivery status changes are explicit API actions.
- No stock mutation from frontend; stock changes happen through backend services only.
