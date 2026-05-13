# ERP Document Flow (Current + Additive)

## 1. Finance + accounting control (current)
1. Admin uses setup endpoints under `/api/v1/admin/accounting/*` for status/health/defaults/mappings.
2. Canonical Chart of Accounts + FinanceAccount mapping is validated in service layer (`accounting_setup_service`, `setup_health_service`, `accounting_setup_status`).
3. Books/reports/journals are exposed through `/api/v1/accounting/*` endpoints.

## 2. Direct sale + billing (current)
1. Direct sale documents are managed in `/api/v1/billing/direct-sales/` and related invoice/receipt endpoints.
2. Document sync is controlled by billing sync endpoints (`/api/v1/billing/payments/<id>/sync/`, sync-events).
3. Accounting bridge posting runs via `/api/v1/accounting/bridges/run-retail-sale/`.

## 3. EMI/subscription collections (current)
1. Subscription/payment lifecycle remains on existing subscription/payment services.
2. Financial summary and dashboard rollups use canonical summary service.
3. Accounting bridge posting for EMI lifecycle uses:
   - `/api/v1/accounting/bridges/run-emi-subscription/`
   - `/api/v1/accounting/bridges/run-emi-payment/`
   - `/api/v1/accounting/bridges/run-emi-waiver/`

## 4. Inventory + purchase + vendor (current)
1. Inventory stock and movement documents are handled through `/api/v1/inventory/*`.
2. Purchase docs and vendor settlement accounting flows exist under accounting + inventory route families.
3. Inventory accounting bridge sync runs via `/api/v1/accounting/bridges/run-inventory-posting/`.

## 5. Delivery + returns + cancellations (current)
1. Delivery transitions are handled in `admin_deliveries` endpoints.
2. Return/cancel data remains explicit and auditable in delivery/service-desk/cancellation serializers.

## 6. Proposed additive document flow (future)
- Keep each module posting through service-layer bridges; do not allow UI-driven ledger mutation.
- Extend rent/lease documents by adding new posting profiles and bridge purposes, without touching existing EMI journal history.
- Add automation queues and BI exports as additive consumers of existing ledger/document truth.
