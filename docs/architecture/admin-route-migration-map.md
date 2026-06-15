# Admin Route Migration Map

This map is the Phase 0 control document for cleaning admin routes without breaking production workflows.

## Status values

| Status | Meaning |
|---|---|
| keep | Current route is canonical or acceptable as-is. |
| alias | Keep route as redirect/alias to canonical module route. |
| migrate_then_alias | Create canonical route, migrate UI links, then keep old route as alias. |
| keep_temporarily | Operational route remains until replacement page is verified. |
| delete_later | Delete only after old route has redirected safely through at least one release cycle. |

## Current to target route ownership

| Current route | Target module | Target route | Status | Notes |
|---|---|---|---|---|
| `/admin` | Command Center | `/admin` | keep | Owner/admin daily cockpit. |
| `/admin/operations` | Command Center | `/admin/operations` | keep | Cross-module operations. |
| `/admin/operations/today-work` | Command Center | `/admin/operations/today-work` | keep | Daily work queue. |
| `/admin/operations/command-center` | Command Center | `/admin/operations/command-center` | keep | Enterprise control surface. |
| `/admin/customers` | Profiles & Parties | `/admin/profiles/customers` | migrate_then_alias | Customer object cockpit should live under Profiles. |
| `/admin/partners` | Profiles & Parties | `/admin/profiles/partners` | migrate_then_alias | Partner profile, not finance payout workspace. |
| `/admin/vendors` | Profiles & Parties / Purchases | `/admin/profiles/vendors` | migrate_then_alias | Vendor identity under Profiles; procurement under Purchases. |
| `/admin/hr/staff` | Profiles & Parties / HR | `/admin/profiles/staff` and `/admin/hr/staff` | keep_temporarily | Staff profile belongs to Profiles; HR workflow remains under HR. |
| `/admin/branches` | Profiles & Parties / Settings | `/admin/profiles/branches` | migrate_then_alias | Branch profile and operational branch status. Configuration remains Settings. |
| `/admin/crm/parties` | Profiles & Parties | `/admin/profiles/parties` | migrate_then_alias | Party master should become canonical party route. |
| `/admin/crm` | CRM & Requests | `/admin/crm` | keep | CRM workspace. |
| `/admin/crm/leads` | CRM & Requests | `/admin/crm/leads` | keep | Lead register. |
| `/admin/crm/pipeline` | CRM & Requests | `/admin/crm/pipeline` | keep | Pipeline. |
| `/admin/crm/follow-ups` | CRM & Requests | `/admin/crm/follow-ups` | keep | Follow-up tasks. |
| `/admin/crm/kyc` | CRM & Requests | `/admin/crm/kyc` | keep | KYC queue. |
| `/admin/online-enquiries` | CRM & Requests | `/admin/requests/online-enquiries` | migrate_then_alias | Public enquiry queue. |
| `/admin/support-requests` | CRM & Requests / Service | `/admin/requests/support` | migrate_then_alias | Intake route; service cases remain Service Desk. |
| `/admin/subscription-requests` | CRM & Requests / Sales | `/admin/requests/subscriptions` | migrate_then_alias | Request queue feeding Sales. |
| `/admin/sales` | Sales & Contracts | `/admin/sales` | keep | Sales workspace. |
| `/admin/billing/direct-sale` | Sales & Contracts | `/admin/sales/direct-sale` | migrate_then_alias | Direct sale belongs under Sales; billing documents remain linked. |
| `/admin/billing/direct-sale/create` | Sales & Contracts | `/admin/sales/direct-sale/create` | migrate_then_alias | Existing route can remain alias. |
| `/admin/subscriptions` | Sales & Contracts | `/admin/subscriptions` | keep | Contract register with plan filters. |
| `/admin/rent-lease` | Sales & Contracts / Rent-Lease | `/admin/rent-lease` | keep | Rent/lease cockpit. |
| `/admin/contract-amendments` | Sales & Contracts | `/admin/contract-amendments` | keep | Controlled contract change workflow. |
| `/admin/batches` | Lucky Plan Control | `/admin/lucky-plan/batches` | migrate_then_alias | Batch lifecycle and draw scope. |
| `/admin/lucky-ids` | Lucky Plan Control | `/admin/lucky-plan/lucky-ids` | migrate_then_alias | Lucky ID register. |
| `/admin/lucky-draws` | Lucky Plan Control | `/admin/lucky-plan/draws` | migrate_then_alias | Draw execution and evidence. |
| `/admin/finance/collect` | Collections & Cashier | `/admin/collections/collect` | migrate_then_alias | Unified collection workspace. |
| `/admin/payments` | Collections & Cashier / Finance | `/admin/collections/payments` | migrate_then_alias | Payment register; finance reads source state. |
| `/admin/settlements` | Collections & Cashier | `/admin/collections/settlements` | migrate_then_alias | Settlement imports and evidence. |
| `/admin/settlements/day-closes` | Collections & Cashier | `/admin/collections/day-closes` | migrate_then_alias | Cashier day close. |
| `/admin/outstandings` | Finance Operations | `/admin/finance/outstandings` | migrate_then_alias | Money due cockpit. |
| `/admin/finance/deposits` | Finance Operations | `/admin/finance/deposits` | keep | Security deposit operations. |
| `/admin/finance/commissions` | Finance Operations | `/admin/finance/commissions` | keep | Commission source register. |
| `/admin/finance/payout-batches` | Finance Operations | `/admin/finance/payout-batches` | keep | Partner payout source workflow. |
| `/admin/finance/reversal-control` | Finance Operations | `/admin/finance/reversal-control` | keep | Controlled reversal workflow. |
| `/admin/accounting` | Accounting & Reconciliation | `/admin/accounting` | keep | Accounting cockpit. |
| `/admin/accounting/setup` | Accounting & Reconciliation | `/admin/accounting/setup` | keep | COA/finance mapping setup. |
| `/admin/accounting/chart-of-accounts` | Accounting & Reconciliation | `/admin/accounting/chart-of-accounts` | keep | COA. |
| `/admin/accounting/finance-accounts` | Accounting & Reconciliation | `/admin/accounting/finance-accounts` | keep | Operational finance accounts mapped to ledger. |
| `/admin/accounting/journals` | Accounting & Reconciliation | `/admin/accounting/journals` | keep | Journal register. |
| `/admin/accounting/bridge-reconciliation` | Accounting & Reconciliation | `/admin/accounting/bridge-reconciliation` | keep | Canonical reconciliation route. |
| `/admin/accounting/periods` | Accounting & Reconciliation | `/admin/accounting/periods` | keep | Period locks and close readiness. |
| `/admin/accounting/books` | Accounting & Reconciliation | `/admin/accounting/books` | keep | Cash/bank/UPI/sales/purchase books. |
| `/admin/inventory` | Inventory & Stock | `/admin/inventory` | keep | Inventory workspace. |
| `/admin/inventory/items` | Inventory & Stock | `/admin/inventory/items` | keep | Item master. |
| `/admin/inventory/stock-on-hand` | Inventory & Stock | `/admin/inventory/stock-on-hand` | keep | Stock posture. |
| `/admin/inventory/ledger` | Inventory & Stock | `/admin/inventory/ledger` | keep | Stock ledger. |
| `/admin/inventory/movements` | Inventory & Stock | `/admin/inventory/movements` | keep | Movement register. |
| `/admin/purchases/*` | Purchases & Vendors | `/admin/purchases/*` | keep | Purchase lifecycle. |
| `/admin/vendors/*` | Purchases & Vendors | `/admin/vendors/*` | keep_temporarily | Split profile vs procurement in Phase 5. |
| `/admin/deliveries` | Delivery & Service | `/admin/deliveries` | keep | Delivery register. |
| `/admin/delivery/workspace` | Delivery & Service | `/admin/delivery/workspace` | keep | Delivery document workflow. |
| `/admin/delivery/returns` | Delivery & Service | `/admin/delivery/returns` | keep | Delivery return workflow. |
| `/admin/service-desk/*` | Delivery & Service | `/admin/service-desk/*` | keep | Complaints, cases, returns, tickets. |
| `/admin/hr/*` | HR & Staff | `/admin/hr/*` | keep | HR workflows. |
| `/admin/bi/*` | BI & Reports | `/admin/bi/*` | keep | Read-only analytics. |
| `/admin/reports*` | BI & Reports | `/admin/reports*` | keep_temporarily | Later converge into BI/report center. |
| `/admin/settings/*` | Settings & Governance | `/admin/settings/*` | keep | System settings and setup. |
| `/admin/audit-logs` | Settings & Governance | `/admin/audit-logs` | keep | Audit trail. |
| `/admin/brand-data` | Settings & Governance | `/admin/brand-data` | keep | Public business data setup. |

## Route cleanup order

1. Add module taxonomy metadata; no UI behavior change.
2. Update navigation grouping only; keep route paths unchanged.
3. Add new canonical aliases for Profiles, Lucky Plan, Collections, and Requests.
4. Migrate internal links to canonical routes.
5. Keep old routes as redirects.
6. Add route smoke tests.
7. Remove only after one stable release cycle and explicit approval.

## Required route smoke set

```text
/admin
/admin/operations/today-work
/admin/profiles/customers
/admin/customers
/admin/sales
/admin/subscriptions
/admin/lucky-plan/batches
/admin/batches
/admin/collections/collect
/admin/finance/collect
/admin/finance/deposits
/admin/accounting
/admin/accounting/bridge-reconciliation
/admin/inventory
/admin/purchases/orders
/admin/vendors
/admin/deliveries
/admin/service-desk
/admin/hr/staff
/admin/bi
/admin/settings/business-setup
```
