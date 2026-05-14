# Report Export and Role Scope (Phase 9)

## Implemented access model
- Reports Center endpoints require authenticated admin role:
  - `backend/api/v1/views/reports_center.py` (`IsAdmin`)
- Export requires explicit capability check:
  - `reports.export` capability verified before CSV/PDF response.

## Implemented export endpoints
- Catalog: `/api/v1/admin/reports-center/catalog/`
- Report payload: `/api/v1/admin/reports-center/reports/<report_key>/`
- Export: `/api/v1/admin/reports-center/reports/<report_key>/export/?format=csv|pdf`

## Implemented role scope constraints
- Admin-only reporting surfaces remain under admin route namespace.
- Notification and dashboard data are role-scoped via dedicated route families and scope resolution.

## Data handling notes
- Export responses are generated from current filtered source records at request time.
- Export actions do not mutate payment/ledger/EMI/draw data.

## Operational policy
- Admin exports may include sensitive operational/financial data and must remain internal.
- Public/partner/customer/cashier views must consume only role-appropriate endpoints.

## Future additive work (proposed, not implemented)
- Export approval queue for highly sensitive report classes.
- Signed export audit receipt with immutable retention policy.
