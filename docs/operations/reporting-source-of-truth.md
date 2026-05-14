# Reporting Source of Truth (Phase 9)

## Principle
All operational reports and BI in this repository must be reproducible from persisted source records. No fabricated KPIs/charts/counters are allowed.

## Implemented reporting services
- Reports Center engine:
  - `backend/subscriptions/services/reports_center_service.py`
  - endpoint family: `/api/v1/admin/reports-center/reports/<report_key>/`
- BI aggregate engine:
  - `backend/subscriptions/services/business_intelligence_service.py`
  - endpoint family: `/api/v1/admin/bi/*`
- Dashboard surfaces (role scoped):
  - `backend/api/v1/views/dashboard_surfaces.py`
  - `/api/v1/dashboards/*`

## Canonical source models used
- Subscription/EMI/payment: `subscriptions` app models
- Direct sale invoices/receipts: `billing` app models
- Stock movement and inventory state: `inventory` app models
- HR payroll/staff summaries: `accounting` app models/services
- Reconciliation and control summaries: `subscriptions` + `accounting` services

## Reproducibility controls
- Date-window filters and explicit filter payload echo in responses.
- Read-only report builders; no write side effects.
- Test coverage includes report totals consistency and read-only behavior.

## Known practical limits
- Some high-volume reports intentionally cap rows in API payloads for operational UI safety; totals remain derived from filtered querysets.

## Future additive work (proposed, not implemented)
- Durable report snapshot entity with signed hash for compliance archival.
- Cross-module report lineage metadata table for per-row provenance.
