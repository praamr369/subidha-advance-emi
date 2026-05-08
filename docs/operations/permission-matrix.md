# Permission Matrix (Regression Focus)

## Cashier
- Allowed: cashier collection and cashier-safe dashboards.
- Forbidden: admin business setup, admin lucky draw controls, admin accounting setup/control, admin commission payout controls.

## Customer
- Allowed: own dashboard, own subscriptions/payments/documents/support.
- Forbidden: admin APIs, partner APIs, vendor APIs, internal accounting/reconciliation/stock endpoints, other customer data.

## Partner
- Allowed: own partner-scoped customers/subscriptions/payments/commissions/payout views.
- Forbidden: vendor APIs, admin accounting routes, cross-partner data.

## Vendor
- Allowed: vendor self dashboard/profile/ledger/quote/purchase endpoints.
- Forbidden: customer EMI data, partner commission APIs, admin accounting/reconciliation routes, other vendor data.

## Public
- Allowed: public stats, winners/latest winner, public products, public contact/profile.
- Forbidden: private customer PII, internal ledgers/accounting data, admin-only fields.

## Enforcement Rule
- Frontend hiding is not enough.
- Direct URL/API access must be rejected by backend permission classes and route-level protections.
