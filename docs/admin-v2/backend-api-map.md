# Admin V2 Backend API Map

This is a documentation map, not a new contract.

Admin V2 must continue to use the existing Django/DRF backend as the source of truth.

## Shared rules

- use `/api/v1` only
- do not invent endpoints in the browser
- keep money, stock, and reconciliation math on the backend
- treat missing endpoints as documented gaps

## Authentication

Expected auth family:

- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/refresh/`
- `POST /api/v1/auth/logout/`
- `GET /api/v1/auth/me/`

## Command Center

Expected families:

- `GET /api/v1/admin/dashboard/`
- `GET /api/v1/dashboards/summary-v2/`
- `GET /api/v1/dashboards/surfaces/upcoming/`
- `GET /api/v1/dashboards/surfaces/overdue/`
- `GET /api/v1/dashboards/surfaces/recent-payments/`
- `GET /api/v1/dashboards/surfaces/winners/`
- `GET /api/v1/dashboards/surfaces/reconciliation-exceptions/`

## Customer 360

Expected families:

- `GET /api/v1/admin/customers/`
- `POST /api/v1/admin/customers/`
- `GET /api/v1/admin/customers/{id}/`
- `PATCH /api/v1/admin/customers/{id}/`
- `GET /api/v1/admin/customers/{id}/operational-summary/`
- `GET /api/v1/admin/customers/{id}/timeline/`
- `GET /api/v1/admin/customers/{id}/risk-profile/`
- `GET /api/v1/admin/customer/{id}/statement/`

## Revenue

Expected families:

- `GET /api/v1/admin/subscriptions/`
- `POST /api/v1/admin/subscriptions/`
- `GET /api/v1/admin/emis/`
- `GET /api/v1/admin/batches/`
- `POST /api/v1/admin/batches/`
- `GET /api/v1/admin/lucky-ids/`
- `GET /api/v1/admin/lucky-draws/`
- `POST /api/v1/admin/lucky-draws/`
- `GET /api/v1/admin/payments/`
- `POST /api/v1/admin/receivables/collect/`
- `GET /api/v1/admin/receivables/search/`
- `GET /api/v1/admin/invoices/`
- `GET /api/v1/admin/receipts/`
- `GET /api/v1/admin/finance/deposits/`
- `GET /api/v1/admin/finance/dues/`
- `GET /api/v1/admin/finance/overdue/`
- `GET /api/v1/admin/settlements/...`
- `GET /api/v1/admin/billing/products/search/`
- `POST /api/v1/admin/direct-sales/preview/`
- `POST /api/v1/admin/billing/direct-sales/{id}/finalize-invoice/`
- `POST /api/v1/admin/contracts/rent/`
- `POST /api/v1/admin/contracts/lease/`

## Inventory & Fulfillment

Expected families:

- `GET /api/v1/admin/products/`
- `POST /api/v1/admin/products/`
- `PATCH /api/v1/admin/products/{id}/`
- `GET /api/v1/admin/product-categories/`
- `GET /api/v1/admin/product-subcategories/`
- `GET /api/v1/admin/product-units/`
- `GET /api/v1/admin/inventory/...`
- `GET /api/v1/admin/inventory/opening-stock/`
- `GET /api/v1/admin/deliveries/`
- `POST /api/v1/admin/deliveries/`
- `GET /api/v1/admin/deliveries/summary/`
- `GET /api/v1/admin/deliveries/{id}/`
- `POST /api/v1/admin/deliveries/{id}/transition/`
- `POST /api/v1/admin/deliveries/{id}/mark-delivered/`
- `POST /api/v1/admin/deliveries/{id}/mark-failed/`
- `POST /api/v1/admin/deliveries/{id}/cancel/`
- `POST /api/v1/admin/deliveries/{id}/request-return/`
- `POST /api/v1/admin/deliveries/{id}/mark-returned/`
- `GET /api/v1/admin/support/tickets/`
- `POST /api/v1/admin/support/tickets/`

## Finance Control

Expected families:

- `GET /api/v1/admin/finance/dashboard/`
- `GET /api/v1/admin/finance/collections/`
- `GET /api/v1/admin/finance/dues/`
- `GET /api/v1/admin/finance/overdue/`
- `GET /api/v1/admin/finance/deposits/`
- `POST /api/v1/admin/finance/deposits/deduct/`
- `POST /api/v1/admin/finance/deposits/refund-approve/`
- `POST /api/v1/admin/finance/deposits/refund/`
- `GET /api/v1/admin/reconciliation/overview/`
- `GET /api/v1/admin/reconciliation/runs/`
- `POST /api/v1/admin/reconciliation/runs/`
- `GET /api/v1/admin/reconciliation/items/`
- `POST /api/v1/admin/reconciliation/items/{id}/resolve/`
- `POST /api/v1/admin/reconciliation/items/{id}/reopen/`
- `GET /api/v1/admin/accounting/control-center/`
- `GET /api/v1/admin/accounting/...`
- `GET /api/v1/admin/audit-logs/`
- `GET /api/v1/admin/audit/events/`

## CRM & Partners

Expected families:

- `GET /api/v1/admin/leads/`
- `GET /api/v1/admin/leads/{id}/`
- `POST /api/v1/admin/leads/{id}/status/`
- `POST /api/v1/admin/leads/{id}/assign/`
- `POST /api/v1/admin/leads/{id}/notes/`
- `POST /api/v1/admin/leads/{id}/convert/`
- `GET /api/v1/admin/online-enquiries/`
- `GET /api/v1/admin/support-requests/`
- `GET /api/v1/admin/subscription-requests/`
- `POST /api/v1/admin/subscription-requests/{id}/approve/`
- `POST /api/v1/admin/subscription-requests/{id}/reject/`
- `GET /api/v1/admin/collection-requests/`
- `POST /api/v1/admin/collection-requests/{id}/approve/`
- `POST /api/v1/admin/collection-requests/{id}/reject/`
- `GET /api/v1/admin/commissions/`
- `GET /api/v1/admin/commissions/summary/`
- `GET /api/v1/admin/commission-payout-batches/list/`

## Operations & People

Expected families:

- `GET /api/v1/admin/hr/...`
- `GET /api/v1/admin/internal-users/`
- `POST /api/v1/admin/internal-users/create/`
- `POST /api/v1/admin/internal-users/{id}/activate/`
- `POST /api/v1/admin/internal-users/{id}/deactivate/`
- `POST /api/v1/admin/internal-users/{id}/reset-password/`
- `GET /api/v1/admin/contracts/{id}/amendments/`
- `POST /api/v1/admin/contracts/{id}/amendments/`
- `POST /api/v1/admin/contracts/amendments/{id}/approve/`
- `POST /api/v1/admin/contracts/amendments/{id}/reject/`
- `POST /api/v1/admin/contracts/amendments/{id}/apply/`
- `GET /api/v1/admin/notifications/`
- `POST /api/v1/admin/notifications/{id}/read/`

## Reports & Setup

Expected families:

- `GET /api/v1/admin/reports/...`
- `GET /api/v1/admin/reports-center/...`
- `GET /api/v1/admin/business-setup/checklist/`
- `GET /api/v1/admin/business-setup/document-numbering/`
- `POST /api/v1/admin/business-setup/reset-preview/`
- `POST /api/v1/admin/business-setup/reset/`
- `GET /api/v1/admin/business-setup/backups/`
- `POST /api/v1/admin/business-setup/restore/preview/`
- `POST /api/v1/admin/business-setup/restore/`
- `GET /api/v1/admin/setup-readiness/`
- `GET /api/v1/admin/setup-snapshot/export/`
- `POST /api/v1/admin/setup-snapshot/import/`
- `GET /api/v1/admin/settings/roles-permissions/`
- `PATCH /api/v1/admin/settings/roles-permissions/...`

