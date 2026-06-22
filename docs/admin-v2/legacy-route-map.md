# Admin V2 Legacy Route Map

This map shows how the current route-heavy admin surface collapses into the 8 Admin V2 workbenches.

## Keep as workbench internal state

These should not become first-class V2 pages:

- create flows
- detail drilldowns
- edit flows
- action-specific history pages
- approval fragments
- tabbed subviews

## Route families and targets

| Legacy family | V2 target | Notes |
|---|---|---|
| `dashboard` | Command Center | Replace legacy dashboard and ERP home surfaces. |
| `operations` | Command Center | Daily work queue and exception handling. |
| `analytics` | Command Center | Operational overview only. |
| `bi` | Command Center / Reports & Setup | Keep read-only summaries, not standalone noise. |
| `global-search` | Command Center | Command palette entry, not a standalone module. |
| `notifications` | Command Center / Operations & People | Shared notification center. |
| `customers` | Customer 360 | One customer, one workbench. |
| `crm/customers` | Customer 360 | Merge into customer 360. |
| `crm/kyc` | Customer 360 / CRM & Partners | KYC review queue stays role-safe. |
| `profiles/customers` | Customer 360 | Do not keep as a separate admin module. |
| `profiles/parties` | Customer 360 / CRM & Partners | Party master data belongs in the same customer-centric workbench. |
| `customer-advances` | Revenue Workbench / Finance Control | Surface as a tab, not a separate route family. |
| `sales` | Revenue Workbench | Sales desk and direct sale. |
| `billing` | Revenue Workbench | Billing, invoices, receipts, and direct sale settlement. |
| `collections` | Revenue Workbench / Finance Control | Collection review and cash flow visibility. |
| `payments` | Revenue Workbench | Payment register and collection actions. |
| `receipts` | Revenue Workbench | Receipt visibility only. |
| `outstandings` | Revenue Workbench / Finance Control | Risk and receivable review. |
| `settlements` | Revenue Workbench / Finance Control | Bank and UPI settlement evidence. |
| `counters` | Revenue Workbench / Operations & People | Counter selection and branch context. |
| `rent-lease` | Revenue Workbench | Rent and lease must remain separate from EMI logic. |
| `subscriptions` | Revenue Workbench | EMI and contract lifecycle. |
| `subscription-requests` | CRM & Partners | Intake queue, not contract auto-creation. |
| `batches` | Revenue Workbench | Lucky Plan batch control. |
| `lucky-plan` | Revenue Workbench | Consolidated Lucky Plan area. |
| `lucky-ids` | Revenue Workbench | Lucky ID register and allocation view. |
| `lucky-draws` | Revenue Workbench | Draw visibility and winner evidence. |
| `emi` | Revenue Workbench | EMI register and schedule review. |
| `emi-overdue` | Revenue Workbench | Same tab with overdue filter. |
| `inventory` | Inventory & Fulfillment | Stock on hand, movements, ledger, adjustments. |
| `products` | Inventory & Fulfillment | Product catalog and operational maintenance. |
| `purchases` | Inventory & Fulfillment | Purchase chain visibility. |
| `vendors` | Inventory & Fulfillment / CRM & Partners | Vendor operational view. |
| `manufacturing` | Inventory & Fulfillment | Keep as an operational tab only. |
| `deliveries` | Inventory & Fulfillment | Delivery lifecycle and fulfillment state. |
| `delivery` | Inventory & Fulfillment | No standalone duplicate route in V2. |
| `service` | Inventory & Fulfillment | Service desk stays inside the workbench. |
| `brochures` | Inventory & Fulfillment | Quotations and brochure workflow. |
| `finance` | Finance Control | Money truth, not UI-side accounting. |
| `accounting` | Finance Control | Journals and books are backend-authoritative. |
| `reconciliation` | Finance Control | Reconciliation posture and exceptions. |
| `audit-logs` | Finance Control / Reports & Setup | Read-only audit surfaces. |
| `audit-events` | Finance Control / Reports & Setup | Read-only event history. |
| `compliance` | Finance Control / Reports & Setup | Read-only or admin-configured only. |
| `data-quality` | Finance Control / Reports & Setup | Operational diagnostics. |
| `crm` | CRM & Partners | Lead and request surfaces. |
| `leads` | CRM & Partners | Pipeline and follow-ups. |
| `online-enquiries` | CRM & Partners | Intake only. |
| `partners` | CRM & Partners | Partner profile and request context. |
| `partner-payment-requests` | CRM & Partners | Intake queue only. |
| `growth` | CRM & Partners | Offer configuration and preview. |
| `hr` | Operations & People | Staff and attendance workbench. |
| `staff` | Operations & People | Staff register. |
| `branches` | Operations & People | Branch and counter context. |
| `brand-data` | Operations & People / Reports & Setup | Administrative setup only. |
| `reports` | Reports & Setup | Read-only reporting. |
| `reports-center` | Reports & Setup | Report catalog and drilldowns. |
| `settings` | Reports & Setup | Setup and governance. |
| `setup` | Reports & Setup | Setup readiness and initialization. |

## Routes to avoid recreating as standalone V2 pages

- `legacy-dashboard`
- `erp`
- `workspace`
- `delivery`
- `service`
- `partner`
- `lucky-draw`
- `emi`
- `emi-overdue`
- `reports`
- `commisions`

## Deep-link pattern

Use query parameters inside the workbench instead of action-specific pages.

Examples:

- `/admin/customer-360?customerId=123`
- `/admin/revenue?tab=payments&paymentId=55`
- `/admin/revenue?tab=subscriptions&subscriptionId=22`
- `/admin/revenue?tab=emis&status=overdue`
- `/admin/inventory-fulfillment?tab=products&productId=88`
- `/admin/finance-control?tab=reconciliation&runId=7`
- `/admin/reports-setup?tab=users&userId=5`

