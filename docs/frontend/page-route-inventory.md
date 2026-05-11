# Frontend page & route inventory
Generated from `frontend/src/app/**/page.tsx`. Route groups `(name)` are omitted from URLs.
## Summary counts
- **Total `page.tsx` files:** 362
- **admin:** 270
- **auth:** 5
- **cashier:** 7
- **customer:** 27
- **partner:** 20
- **public:** 19
- **utility:** 3
- **vendor:** 11
- **Dynamic detail routes** (`[id]` / `[slug]` in path): 55

## Full inventory

| Route | File (under `frontend/`) | Role/scope | Page purpose (short) | Layout pattern | Primary components | KPI/card-heavy? | Refactor now? | Recommended type | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` | auth | Authentication | forms | (see imports in file) | No | Later | auth_flow | P2 |
| `/login` | `src/app/(auth)/login/page.tsx` | auth | Authentication | forms | (see imports in file) | No | Later | auth_flow | P2 |
| `/logout` | `src/app/(auth)/logout/page.tsx` | auth | Authentication | custom/portal | (see imports in file) | No | Later | auth_flow | P2 |
| `/register` | `src/app/(auth)/register/page.tsx` | auth | Authentication | forms | (see imports in file) | No | Later | auth_flow | P2 |
| `/reset-password` | `src/app/(auth)/reset-password/page.tsx` | auth | Authentication | forms | (see imports in file) | No | Later | auth_flow | P2 |
| `/admin/accounting/assets` | `src/app/(dashboard)/admin/accounting/assets/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/attendance` | `src/app/(dashboard)/admin/accounting/attendance/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/books/bank` | `src/app/(dashboard)/admin/accounting/books/bank/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | accounting_control | P2 |
| `/admin/accounting/books/cash` | `src/app/(dashboard)/admin/accounting/books/cash/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | accounting_control | P2 |
| `/admin/accounting/books` | `src/app/(dashboard)/admin/accounting/books/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/books/purchase` | `src/app/(dashboard)/admin/accounting/books/purchase/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | accounting_control | P2 |
| `/admin/accounting/books/sales` | `src/app/(dashboard)/admin/accounting/books/sales/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | accounting_control | P2 |
| `/admin/accounting/books/upi` | `src/app/(dashboard)/admin/accounting/books/upi/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | accounting_control | P2 |
| `/admin/accounting/bridges` | `src/app/(dashboard)/admin/accounting/bridges/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/chart-of-accounts` | `src/app/(dashboard)/admin/accounting/chart-of-accounts/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Yes | accounting_control | P0 |
| `/admin/accounting/control-center` | `src/app/(dashboard)/admin/accounting/control-center/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | accounting_control | P2 |
| `/admin/accounting/depreciation` | `src/app/(dashboard)/admin/accounting/depreciation/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/expense-claims` | `src/app/(dashboard)/admin/accounting/expense-claims/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/expenses` | `src/app/(dashboard)/admin/accounting/expenses/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/exports/itr-pack` | `src/app/(dashboard)/admin/accounting/exports/itr-pack/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/exports` | `src/app/(dashboard)/admin/accounting/exports/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/gst/credit-notes` | `src/app/(dashboard)/admin/accounting/gst/credit-notes/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/gst/debit-notes` | `src/app/(dashboard)/admin/accounting/gst/debit-notes/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/gst` | `src/app/(dashboard)/admin/accounting/gst/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/gst/tax-invoices` | `src/app/(dashboard)/admin/accounting/gst/tax-invoices/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/journals` | `src/app/(dashboard)/admin/accounting/journals/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/leave` | `src/app/(dashboard)/admin/accounting/leave/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting` | `src/app/(dashboard)/admin/accounting/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/accounting/periods` | `src/app/(dashboard)/admin/accounting/periods/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/purchase-bills` | `src/app/(dashboard)/admin/accounting/purchase-bills/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/reconciliation` | `src/app/(dashboard)/admin/accounting/reconciliation/page.tsx` | admin | admin · operational UI | table shell | DataTableShell, PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/reports/balance-sheet` | `src/app/(dashboard)/admin/accounting/reports/balance-sheet/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/accounting/reports/profit-loss` | `src/app/(dashboard)/admin/accounting/reports/profit-loss/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/accounting/reports/trial-balance` | `src/app/(dashboard)/admin/accounting/reports/trial-balance/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/accounting/salary/[id]` | `src/app/(dashboard)/admin/accounting/salary/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/accounting/salary` | `src/app/(dashboard)/admin/accounting/salary/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/setup` | `src/app/(dashboard)/admin/accounting/setup/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Yes | setup_checklist | P0 |
| `/admin/accounting/staff` | `src/app/(dashboard)/admin/accounting/staff/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/staff-ledger` | `src/app/(dashboard)/admin/accounting/staff-ledger/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/vendor-settlements` | `src/app/(dashboard)/admin/accounting/vendor-settlements/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/accounting/vendors` | `src/app/(dashboard)/admin/accounting/vendors/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | accounting_control | P2 |
| `/admin/ai` | `src/app/(dashboard)/admin/ai/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/ai/query-log` | `src/app/(dashboard)/admin/ai/query-log/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/ai/readiness` | `src/app/(dashboard)/admin/ai/readiness/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/ai/sources/[id]` | `src/app/(dashboard)/admin/ai/sources/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/ai/sources` | `src/app/(dashboard)/admin/ai/sources/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/analytics/churn-analysis` | `src/app/(dashboard)/admin/analytics/churn-analysis/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/analytics` | `src/app/(dashboard)/admin/analytics/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/analytics/risk-monitor` | `src/app/(dashboard)/admin/analytics/risk-monitor/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/audit/events` | `src/app/(dashboard)/admin/audit/events/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/audit-logs` | `src/app/(dashboard)/admin/audit-logs/page.tsx` | admin | admin · operational UI | table shell + forms | DataTableShell, PortalPage | No | Later | register_list | P2 |
| `/admin/batches/[id]/control-center` | `src/app/(dashboard)/admin/batches/[id]/control-center/page.tsx` | admin | admin · operational UI | KPI grid + table shell | KpiCard, QuickActionGrid, WorkflowCard, DataTableShell, DetailPanel, PortalPage | Yes | Yes | detail_page | P1 |
| `/admin/batches/[id]/edit` | `src/app/(dashboard)/admin/batches/[id]/edit/page.tsx` | admin | admin · operational UI | forms | DetailPanel, PortalPage | No | Later | detail_page | P2 |
| `/admin/batches/[id]/generate-lucky-ids` | `src/app/(dashboard)/admin/batches/[id]/generate-lucky-ids/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | detail_page | P2 |
| `/admin/batches/[id]` | `src/app/(dashboard)/admin/batches/[id]/page.tsx` | admin | admin · operational UI | KPI grid + table shell | KpiCard, QuickActionGrid, DataTableShell, DetailPanel, PortalPage | Yes | Yes | detail_page | P1 |
| `/admin/batches/create` | `src/app/(dashboard)/admin/batches/create/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | transaction_form | P2 |
| `/admin/batches` | `src/app/(dashboard)/admin/batches/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P1 |
| `/admin/bi/batches` | `src/app/(dashboard)/admin/bi/batches/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/bi/cashflow` | `src/app/(dashboard)/admin/bi/cashflow/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/bi/customers` | `src/app/(dashboard)/admin/bi/customers/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/bi/hr` | `src/app/(dashboard)/admin/bi/hr/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/bi/inventory` | `src/app/(dashboard)/admin/bi/inventory/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/bi` | `src/app/(dashboard)/admin/bi/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/bi/profitability` | `src/app/(dashboard)/admin/bi/profitability/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/billing/cashbook` | `src/app/(dashboard)/admin/billing/cashbook/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/billing/contracts` | `src/app/(dashboard)/admin/billing/contracts/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/billing/credit-notes` | `src/app/(dashboard)/admin/billing/credit-notes/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/billing/dailybook` | `src/app/(dashboard)/admin/billing/dailybook/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/billing/debit-notes` | `src/app/(dashboard)/admin/billing/debit-notes/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/billing/direct-sale/create` | `src/app/(dashboard)/admin/billing/direct-sale/create/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | transaction_form | P2 |
| `/admin/billing/direct-sale` | `src/app/(dashboard)/admin/billing/direct-sale/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/billing/direct-sales` | `src/app/(dashboard)/admin/billing/direct-sales/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/billing/documents/[id]` | `src/app/(dashboard)/admin/billing/documents/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/billing/invoices` | `src/app/(dashboard)/admin/billing/invoices/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/billing` | `src/app/(dashboard)/admin/billing/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/billing/receipts` | `src/app/(dashboard)/admin/billing/receipts/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/billing/register` | `src/app/(dashboard)/admin/billing/register/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/billing/reversals` | `src/app/(dashboard)/admin/billing/reversals/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/branch-reporting` | `src/app/(dashboard)/admin/branch-reporting/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/branches` | `src/app/(dashboard)/admin/branches/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | register_list | P2 |
| `/admin/brand-data` | `src/app/(dashboard)/admin/brand-data/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/collections` | `src/app/(dashboard)/admin/collections/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, WorkflowCard, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P0 |
| `/admin/counters` | `src/app/(dashboard)/admin/counters/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | register_list | P2 |
| `/admin/crm/customers/[id]` | `src/app/(dashboard)/admin/crm/customers/[id]/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | detail_page | P2 |
| `/admin/crm/follow-ups` | `src/app/(dashboard)/admin/crm/follow-ups/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/crm/kyc` | `src/app/(dashboard)/admin/crm/kyc/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/crm/leads` | `src/app/(dashboard)/admin/crm/leads/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/crm` | `src/app/(dashboard)/admin/crm/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/crm/parties/[id]` | `src/app/(dashboard)/admin/crm/parties/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/crm/parties` | `src/app/(dashboard)/admin/crm/parties/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/crm/pipeline` | `src/app/(dashboard)/admin/crm/pipeline/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/customers/[id]/edit` | `src/app/(dashboard)/admin/customers/[id]/edit/page.tsx` | admin | admin · operational UI | forms | DetailPanel, PortalPage | No | Later | detail_page | P2 |
| `/admin/customers/[id]` | `src/app/(dashboard)/admin/customers/[id]/page.tsx` | admin | admin · operational UI | KPI grid | KpiCard, QuickActionGrid, DetailPanel, PortalPage | Yes | Yes | detail_page | P0 |
| `/admin/customers/[id]/profile` | `src/app/(dashboard)/admin/customers/[id]/profile/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/customers/create` | `src/app/(dashboard)/admin/customers/create/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | transaction_form | P2 |
| `/admin/customers` | `src/app/(dashboard)/admin/customers/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P0 |
| `/admin/deliveries/[id]` | `src/app/(dashboard)/admin/deliveries/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/deliveries/direct-sale-cases/[caseId]` | `src/app/(dashboard)/admin/deliveries/direct-sale-cases/[caseId]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | operations_workspace | P2 |
| `/admin/deliveries` | `src/app/(dashboard)/admin/deliveries/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Yes | operations_workspace | P0 |
| `/admin/delivery/create` | `src/app/(dashboard)/admin/delivery/create/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Yes | transaction_form | P0 |
| `/admin/delivery` | `src/app/(dashboard)/admin/delivery/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Yes | operations_workspace | P0 |
| `/admin/delivery/returns` | `src/app/(dashboard)/admin/delivery/returns/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Yes | operations_workspace | P0 |
| `/admin/delivery/workspace` | `src/app/(dashboard)/admin/delivery/workspace/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Yes | operations_workspace | P0 |
| `/admin/emi/overdue` | `src/app/(dashboard)/admin/emi/overdue/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/emis/overdue` | `src/app/(dashboard)/admin/emis/overdue/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P1 |
| `/admin/emis` | `src/app/(dashboard)/admin/emis/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/emis/pending` | `src/app/(dashboard)/admin/emis/pending/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/erp` | `src/app/(dashboard)/admin/erp/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/finance/collect` | `src/app/(dashboard)/admin/finance/collect/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/finance/commisions` | `src/app/(dashboard)/admin/finance/commisions/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/finance/commissions` | `src/app/(dashboard)/admin/finance/commissions/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | register_list | P2 |
| `/admin/finance/commissions/settled` | `src/app/(dashboard)/admin/finance/commissions/settled/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | register_list | P2 |
| `/admin/finance/deposits` | `src/app/(dashboard)/admin/finance/deposits/page.tsx` | admin | admin · operational UI | table shell | DataTableShell, PortalPage | No | Later | register_list | P2 |
| `/admin/finance` | `src/app/(dashboard)/admin/finance/page.tsx` | admin | admin · operational UI | KPI grid + forms | KpiCard, QuickActionGrid, PortalPage | Yes | Yes | register_list | P1 |
| `/admin/finance/payout-batches/[id]` | `src/app/(dashboard)/admin/finance/payout-batches/[id]/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | detail_page | P2 |
| `/admin/finance/payout-batches` | `src/app/(dashboard)/admin/finance/payout-batches/page.tsx` | admin | admin · operational UI | table shell + forms | DataTableShell, PortalPage | No | Later | register_list | P2 |
| `/admin/finance/reconciliation` | `src/app/(dashboard)/admin/finance/reconciliation/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/finance/reversal-control/[id]` | `src/app/(dashboard)/admin/finance/reversal-control/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/finance/reversal-control` | `src/app/(dashboard)/admin/finance/reversal-control/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/finance/reversal-reconciliation` | `src/app/(dashboard)/admin/finance/reversal-reconciliation/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/finance/workspace` | `src/app/(dashboard)/admin/finance/workspace/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Yes | register_list | P0 |
| `/admin/global-search` | `src/app/(dashboard)/admin/global-search/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | register_list | P2 |
| `/admin/hr/attendance` | `src/app/(dashboard)/admin/hr/attendance/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/hr/expenses` | `src/app/(dashboard)/admin/hr/expenses/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/hr/leave` | `src/app/(dashboard)/admin/hr/leave/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/hr` | `src/app/(dashboard)/admin/hr/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/hr/payroll` | `src/app/(dashboard)/admin/hr/payroll/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/hr/salary-payments` | `src/app/(dashboard)/admin/hr/salary-payments/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/hr/staff/[id]` | `src/app/(dashboard)/admin/hr/staff/[id]/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, WorkflowCard, DataTableShell, DetailPanel, PortalPage | Yes | Yes | detail_page | P1 |
| `/admin/hr/staff` | `src/app/(dashboard)/admin/hr/staff/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, WorkflowCard, DataTableShell, PortalPage | Yes | Yes | register_list | P1 |
| `/admin/hr/staff-documents` | `src/app/(dashboard)/admin/hr/staff-documents/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, WorkflowCard, DataTableShell, PortalPage | Yes | Yes | register_list | P1 |
| `/admin/inventory/adjustments` | `src/app/(dashboard)/admin/inventory/adjustments/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/demand-planning` | `src/app/(dashboard)/admin/inventory/demand-planning/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/items` | `src/app/(dashboard)/admin/inventory/items/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/ledger` | `src/app/(dashboard)/admin/inventory/ledger/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/locations` | `src/app/(dashboard)/admin/inventory/locations/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/movements` | `src/app/(dashboard)/admin/inventory/movements/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/opening-stock` | `src/app/(dashboard)/admin/inventory/opening-stock/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory` | `src/app/(dashboard)/admin/inventory/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/purchase-needs` | `src/app/(dashboard)/admin/inventory/purchase-needs/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/readiness` | `src/app/(dashboard)/admin/inventory/readiness/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/stock-needs` | `src/app/(dashboard)/admin/inventory/stock-needs/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/stock-on-hand` | `src/app/(dashboard)/admin/inventory/stock-on-hand/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/valuation` | `src/app/(dashboard)/admin/inventory/valuation/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/inventory/workspace` | `src/app/(dashboard)/admin/inventory/workspace/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/leads/[id]` | `src/app/(dashboard)/admin/leads/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/leads` | `src/app/(dashboard)/admin/leads/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | register_list | P2 |
| `/admin/lucky-draw/history` | `src/app/(dashboard)/admin/lucky-draw/history/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/lucky-draw` | `src/app/(dashboard)/admin/lucky-draw/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/lucky-draws/[id]` | `src/app/(dashboard)/admin/lucky-draws/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/lucky-draws/[id]/reveal` | `src/app/(dashboard)/admin/lucky-draws/[id]/reveal/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/lucky-draws/create` | `src/app/(dashboard)/admin/lucky-draws/create/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | transaction_form | P2 |
| `/admin/lucky-draws` | `src/app/(dashboard)/admin/lucky-draws/page.tsx` | admin | admin · operational UI | table shell + forms | DataTableShell, PortalPage | No | Later | register_list | P2 |
| `/admin/lucky-ids/[id]/edit` | `src/app/(dashboard)/admin/lucky-ids/[id]/edit/page.tsx` | admin | admin · operational UI | forms | DetailPanel, PortalPage | No | Later | detail_page | P2 |
| `/admin/lucky-ids/[id]` | `src/app/(dashboard)/admin/lucky-ids/[id]/page.tsx` | admin | admin · operational UI | custom/portal | DetailPanel, PortalPage | No | Later | detail_page | P2 |
| `/admin/lucky-ids` | `src/app/(dashboard)/admin/lucky-ids/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P1 |
| `/admin/manufacturing/boms` | `src/app/(dashboard)/admin/manufacturing/boms/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/manufacturing/jobs/[id]` | `src/app/(dashboard)/admin/manufacturing/jobs/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/manufacturing/jobs` | `src/app/(dashboard)/admin/manufacturing/jobs/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/manufacturing` | `src/app/(dashboard)/admin/manufacturing/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/notifications` | `src/app/(dashboard)/admin/notifications/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/online-enquiries/[id]` | `src/app/(dashboard)/admin/online-enquiries/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/online-enquiries` | `src/app/(dashboard)/admin/online-enquiries/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/operations/command-center` | `src/app/(dashboard)/admin/operations/command-center/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | executive_dashboard | P2 |
| `/admin/operations` | `src/app/(dashboard)/admin/operations/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/operations/today-work` | `src/app/(dashboard)/admin/operations/today-work/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | operations_workspace | P2 |
| `/admin/outstandings` | `src/app/(dashboard)/admin/outstandings/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin` | `src/app/(dashboard)/admin/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Yes | executive_dashboard | P0 |
| `/admin/partner/commisions` | `src/app/(dashboard)/admin/partner/commisions/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/partner/commissions` | `src/app/(dashboard)/admin/partner/commissions/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/partner-payment-requests` | `src/app/(dashboard)/admin/partner-payment-requests/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/partners/[id]` | `src/app/(dashboard)/admin/partners/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/partners/collection-requests` | `src/app/(dashboard)/admin/partners/collection-requests/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | approval_queue | P2 |
| `/admin/partners/commisions` | `src/app/(dashboard)/admin/partners/commisions/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/partners/commissions` | `src/app/(dashboard)/admin/partners/commissions/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/partners` | `src/app/(dashboard)/admin/partners/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/partners/workspace` | `src/app/(dashboard)/admin/partners/workspace/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/payments/[id]` | `src/app/(dashboard)/admin/payments/[id]/page.tsx` | admin | admin · operational UI | forms | DetailPanel, PortalPage | No | Later | detail_page | P2 |
| `/admin/payments/create` | `src/app/(dashboard)/admin/payments/create/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | transaction_form | P2 |
| `/admin/payments/history` | `src/app/(dashboard)/admin/payments/history/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/payments` | `src/app/(dashboard)/admin/payments/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, WorkflowCard, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P0 |
| `/admin/payments/reconciliation` | `src/app/(dashboard)/admin/payments/reconciliation/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/products/[id]/edit` | `src/app/(dashboard)/admin/products/[id]/edit/page.tsx` | admin | admin · operational UI | forms | DetailPanel, PortalPage | No | Later | detail_page | P2 |
| `/admin/products/[id]` | `src/app/(dashboard)/admin/products/[id]/page.tsx` | admin | admin · operational UI | table shell | DataTableShell, DetailPanel, PortalPage | No | Later | detail_page | P2 |
| `/admin/products/create` | `src/app/(dashboard)/admin/products/create/page.tsx` | admin | admin · operational UI | KPI grid + forms | KpiCard, QuickActionGrid, DetailPanel, PortalPage | Yes | Yes | transaction_form | P1 |
| `/admin/products/import` | `src/app/(dashboard)/admin/products/import/page.tsx` | admin | admin · operational UI | KPI grid + table shell | KpiCard, QuickActionGrid, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P1 |
| `/admin/products/masters` | `src/app/(dashboard)/admin/products/masters/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/products` | `src/app/(dashboard)/admin/products/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P1 |
| `/admin/products/workspace` | `src/app/(dashboard)/admin/products/workspace/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/purchases/bills` | `src/app/(dashboard)/admin/purchases/bills/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/purchases/orders` | `src/app/(dashboard)/admin/purchases/orders/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/purchases` | `src/app/(dashboard)/admin/purchases/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/purchases/receipts` | `src/app/(dashboard)/admin/purchases/receipts/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/receipts/sample/acknowledgement` | `src/app/(dashboard)/admin/receipts/sample/acknowledgement/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/receipts/sample/invoice` | `src/app/(dashboard)/admin/receipts/sample/invoice/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/receipts/sample` | `src/app/(dashboard)/admin/receipts/sample/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/receipts/sample/payment` | `src/app/(dashboard)/admin/receipts/sample/payment/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/receipts/sample/subscription` | `src/app/(dashboard)/admin/receipts/sample/subscription/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/receipts/sample/waiver` | `src/app/(dashboard)/admin/receipts/sample/waiver/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/reconciliation` | `src/app/(dashboard)/admin/reconciliation/page.tsx` | admin | admin · operational UI | KPI grid + table shell | KpiCard, QuickActionGrid, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P1 |
| `/admin/reminders` | `src/app/(dashboard)/admin/reminders/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/reminders/payment-reminders` | `src/app/(dashboard)/admin/reminders/payment-reminders/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/reports/advance-emi` | `src/app/(dashboard)/admin/reports/advance-emi/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/batch-performance` | `src/app/(dashboard)/admin/reports/batch-performance/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/reports/collections` | `src/app/(dashboard)/admin/reports/collections/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/contracts` | `src/app/(dashboard)/admin/reports/contracts/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/crm` | `src/app/(dashboard)/admin/reports/crm/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/customer-analytics` | `src/app/(dashboard)/admin/reports/customer-analytics/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/reports/delivery` | `src/app/(dashboard)/admin/reports/delivery/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/direct-sales` | `src/app/(dashboard)/admin/reports/direct-sales/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/finance` | `src/app/(dashboard)/admin/reports/finance/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/inventory` | `src/app/(dashboard)/admin/reports/inventory/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/overdue` | `src/app/(dashboard)/admin/reports/overdue/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/reports` | `src/app/(dashboard)/admin/reports/page.tsx` | admin | admin · operational UI | table shell | DataTableShell, PortalPage | No | Later | report_analytics | P2 |
| `/admin/reports/partners` | `src/app/(dashboard)/admin/reports/partners/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/reconciliation` | `src/app/(dashboard)/admin/reports/reconciliation/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/rent-lease` | `src/app/(dashboard)/admin/reports/rent-lease/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports/revenue` | `src/app/(dashboard)/admin/reports/revenue/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | report_analytics | P2 |
| `/admin/reports/waiver-loss` | `src/app/(dashboard)/admin/reports/waiver-loss/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | report_analytics | P2 |
| `/admin/reports-center/[reportKey]` | `src/app/(dashboard)/admin/reports-center/[reportKey]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/reports-center` | `src/app/(dashboard)/admin/reports-center/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/sales/direct-sale/create` | `src/app/(dashboard)/admin/sales/direct-sale/create/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | transaction_form | P2 |
| `/admin/sales` | `src/app/(dashboard)/admin/sales/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/service` | `src/app/(dashboard)/admin/service/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/service-desk/[id]` | `src/app/(dashboard)/admin/service-desk/[id]/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | detail_page | P2 |
| `/admin/service-desk/cases/[id]` | `src/app/(dashboard)/admin/service-desk/cases/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/service-desk/complaints` | `src/app/(dashboard)/admin/service-desk/complaints/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/service-desk` | `src/app/(dashboard)/admin/service-desk/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/service-desk/returns` | `src/app/(dashboard)/admin/service-desk/returns/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/service-desk/tickets` | `src/app/(dashboard)/admin/service-desk/tickets/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | register_list | P2 |
| `/admin/settings/business` | `src/app/(dashboard)/admin/settings/business/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/settings/business-setup/branches` | `src/app/(dashboard)/admin/settings/business-setup/branches/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | setup_checklist | P2 |
| `/admin/settings/business-setup/cash-desks` | `src/app/(dashboard)/admin/settings/business-setup/cash-desks/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | setup_checklist | P2 |
| `/admin/settings/business-setup/chart-accounts` | `src/app/(dashboard)/admin/settings/business-setup/chart-accounts/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Yes | setup_checklist | P0 |
| `/admin/settings/business-setup/checklist` | `src/app/(dashboard)/admin/settings/business-setup/checklist/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | setup_checklist | P2 |
| `/admin/settings/business-setup/document-numbering` | `src/app/(dashboard)/admin/settings/business-setup/document-numbering/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | setup_checklist | P2 |
| `/admin/settings/business-setup/dry-runs` | `src/app/(dashboard)/admin/settings/business-setup/dry-runs/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | setup_checklist | P2 |
| `/admin/settings/business-setup/finance-accounts` | `src/app/(dashboard)/admin/settings/business-setup/finance-accounts/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | setup_checklist | P2 |
| `/admin/settings/business-setup` | `src/app/(dashboard)/admin/settings/business-setup/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | setup_checklist | P2 |
| `/admin/settings/business-setup/profile` | `src/app/(dashboard)/admin/settings/business-setup/profile/page.tsx` | admin | admin · operational UI | forms | (see imports in file) | No | Later | setup_checklist | P2 |
| `/admin/settings/business-setup/public-site` | `src/app/(dashboard)/admin/settings/business-setup/public-site/page.tsx` | admin | admin · operational UI | forms | (see imports in file) | No | Later | setup_checklist | P2 |
| `/admin/settings/business-setup/staff` | `src/app/(dashboard)/admin/settings/business-setup/staff/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | setup_checklist | P2 |
| `/admin/settings/finance` | `src/app/(dashboard)/admin/settings/finance/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/settings/imports` | `src/app/(dashboard)/admin/settings/imports/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/settings/masters` | `src/app/(dashboard)/admin/settings/masters/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/settings` | `src/app/(dashboard)/admin/settings/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/settings/roles` | `src/app/(dashboard)/admin/settings/roles/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/settings/roles-permissions` | `src/app/(dashboard)/admin/settings/roles-permissions/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/admin/settings/users/[id]/edit` | `src/app/(dashboard)/admin/settings/users/[id]/edit/page.tsx` | admin | admin · operational UI | forms | (see imports in file) | No | Later | detail_page | P2 |
| `/admin/settings/users/[id]` | `src/app/(dashboard)/admin/settings/users/[id]/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | detail_page | P2 |
| `/admin/settings/users/create` | `src/app/(dashboard)/admin/settings/users/create/page.tsx` | admin | admin · operational UI | forms | (see imports in file) | No | Later | transaction_form | P2 |
| `/admin/settings/users` | `src/app/(dashboard)/admin/settings/users/page.tsx` | admin | admin · operational UI | table shell | DataTableShell | No | Later | register_list | P2 |
| `/admin/subscription-requests/[id]` | `src/app/(dashboard)/admin/subscription-requests/[id]/page.tsx` | admin | admin · operational UI | table shell + forms | DetailPanel, PortalPage | No | Later | detail_page | P2 |
| `/admin/subscription-requests` | `src/app/(dashboard)/admin/subscription-requests/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | approval_queue | P2 |
| `/admin/subscriptions/[id]/lifecycle` | `src/app/(dashboard)/admin/subscriptions/[id]/lifecycle/page.tsx` | admin | admin · operational UI | forms | DetailPanel, PortalPage | No | Later | detail_page | P2 |
| `/admin/subscriptions/[id]` | `src/app/(dashboard)/admin/subscriptions/[id]/page.tsx` | admin | admin · operational UI | table shell | DataTableShell, DetailPanel, PortalPage | No | Later | detail_page | P2 |
| `/admin/subscriptions/advance-emi/create` | `src/app/(dashboard)/admin/subscriptions/advance-emi/create/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | transaction_form | P2 |
| `/admin/subscriptions/create` | `src/app/(dashboard)/admin/subscriptions/create/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | transaction_form | P2 |
| `/admin/subscriptions/lease/create` | `src/app/(dashboard)/admin/subscriptions/lease/create/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | transaction_form | P2 |
| `/admin/subscriptions` | `src/app/(dashboard)/admin/subscriptions/page.tsx` | admin | admin · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, WorkflowCard, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P0 |
| `/admin/subscriptions/rent/create` | `src/app/(dashboard)/admin/subscriptions/rent/create/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | transaction_form | P2 |
| `/admin/support-requests/[id]` | `src/app/(dashboard)/admin/support-requests/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/support-requests` | `src/app/(dashboard)/admin/support-requests/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/vendors/[id]` | `src/app/(dashboard)/admin/vendors/[id]/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | detail_page | P2 |
| `/admin/vendors/categories` | `src/app/(dashboard)/admin/vendors/categories/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/vendors/ledger` | `src/app/(dashboard)/admin/vendors/ledger/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/vendors/outstanding` | `src/app/(dashboard)/admin/vendors/outstanding/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/vendors` | `src/app/(dashboard)/admin/vendors/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/vendors/products` | `src/app/(dashboard)/admin/vendors/products/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/vendors/purchase-returns` | `src/app/(dashboard)/admin/vendors/purchase-returns/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/vendors/purchases` | `src/app/(dashboard)/admin/vendors/purchases/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/vendors/quotes/[id]` | `src/app/(dashboard)/admin/vendors/quotes/[id]/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/admin/vendors/quotes` | `src/app/(dashboard)/admin/vendors/quotes/page.tsx` | admin | admin · operational UI | forms | PortalPage | No | Later | register_list | P2 |
| `/admin/vendors/sourcing` | `src/app/(dashboard)/admin/vendors/sourcing/page.tsx` | admin | admin · operational UI | custom/portal | PortalPage | No | Later | register_list | P2 |
| `/admin/workspace` | `src/app/(dashboard)/admin/workspace/page.tsx` | admin | admin · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/cashier/billing/direct-sale` | `src/app/(dashboard)/cashier/billing/direct-sale/page.tsx` | cashier | cashier · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/cashier/billing` | `src/app/(dashboard)/cashier/billing/page.tsx` | cashier | cashier · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/cashier/collect` | `src/app/(dashboard)/cashier/collect/page.tsx` | cashier | cashier · operational UI | KPI grid + forms | KpiCard, QuickActionGrid, WorkflowCard, PortalPage | Yes | Yes | cashier_workflow | P0 |
| `/cashier/notifications` | `src/app/(dashboard)/cashier/notifications/page.tsx` | cashier | cashier · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/cashier` | `src/app/(dashboard)/cashier/page.tsx` | cashier | cashier · operational UI | table shell + forms | PortalPage | No | Yes | register_list | P0 |
| `/cashier/payments/[id]` | `src/app/(dashboard)/cashier/payments/[id]/page.tsx` | cashier | cashier · operational UI | forms | QuickActionGrid, WorkflowCard, DetailPanel, PortalPage | Yes | Yes | detail_page | P0 |
| `/cashier/payments` | `src/app/(dashboard)/cashier/payments/page.tsx` | cashier | cashier · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, DataTableShell, DetailPanel, PortalPage | Yes | Yes | register_list | P0 |
| `/customer/account-statement` | `src/app/(dashboard)/customer/account-statement/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | customer_self_service | P2 |
| `/customer/contracts` | `src/app/(dashboard)/customer/contracts/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | customer_self_service | P2 |
| `/customer/dashboard` | `src/app/(dashboard)/customer/dashboard/page.tsx` | customer | customer · operational UI | custom/portal | (see imports in file) | No | Later | customer_self_service | P2 |
| `/customer/deliveries/[id]` | `src/app/(dashboard)/customer/deliveries/[id]/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/customer/deliveries` | `src/app/(dashboard)/customer/deliveries/page.tsx` | customer | customer · operational UI | table shell | PortalPage | No | Later | customer_self_service | P2 |
| `/customer/delivery` | `src/app/(dashboard)/customer/delivery/page.tsx` | customer | customer · operational UI | custom/portal | (see imports in file) | No | Later | customer_self_service | P2 |
| `/customer/direct-sales/[id]` | `src/app/(dashboard)/customer/direct-sales/[id]/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/customer/direct-sales` | `src/app/(dashboard)/customer/direct-sales/page.tsx` | customer | customer · operational UI | table shell | DataTableShell, PortalPage | No | Later | customer_self_service | P2 |
| `/customer/documents` | `src/app/(dashboard)/customer/documents/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | customer_self_service | P2 |
| `/customer/emis` | `src/app/(dashboard)/customer/emis/page.tsx` | customer | customer · operational UI | custom/portal | (see imports in file) | No | Later | customer_self_service | P2 |
| `/customer/finance` | `src/app/(dashboard)/customer/finance/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | customer_self_service | P2 |
| `/customer/invoices` | `src/app/(dashboard)/customer/invoices/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | customer_self_service | P2 |
| `/customer/notifications` | `src/app/(dashboard)/customer/notifications/page.tsx` | customer | customer · operational UI | custom/portal | (see imports in file) | No | Later | customer_self_service | P2 |
| `/customer` | `src/app/(dashboard)/customer/page.tsx` | customer | customer · operational UI | KPI grid | KpiCard, QuickActionGrid | Yes | Yes | customer_self_service | P0 |
| `/customer/payment-schedule` | `src/app/(dashboard)/customer/payment-schedule/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | customer_self_service | P2 |
| `/customer/payments/[id]` | `src/app/(dashboard)/customer/payments/[id]/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/customer/payments` | `src/app/(dashboard)/customer/payments/page.tsx` | customer | customer · operational UI | table shell | DataTableShell, DetailPanel, PortalPage | No | Yes | customer_self_service | P0 |
| `/customer/profile` | `src/app/(dashboard)/customer/profile/page.tsx` | customer | customer · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, DataTableShell, DetailPanel, PortalPage | Yes | Yes | customer_self_service | P0 |
| `/customer/receipts` | `src/app/(dashboard)/customer/receipts/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | customer_self_service | P2 |
| `/customer/subscription-requests/[id]` | `src/app/(dashboard)/customer/subscription-requests/[id]/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/customer/subscription-requests/create` | `src/app/(dashboard)/customer/subscription-requests/create/page.tsx` | customer | customer · operational UI | custom/portal | (see imports in file) | No | Later | transaction_form | P2 |
| `/customer/subscription-requests` | `src/app/(dashboard)/customer/subscription-requests/page.tsx` | customer | customer · operational UI | custom/portal | PortalPage | No | Later | customer_self_service | P2 |
| `/customer/subscriptions/[id]` | `src/app/(dashboard)/customer/subscriptions/[id]/page.tsx` | customer | customer · operational UI | table shell | DataTableShell, PortalPage | No | Later | detail_page | P2 |
| `/customer/subscriptions` | `src/app/(dashboard)/customer/subscriptions/page.tsx` | customer | customer · operational UI | table shell | DataTableShell, DetailPanel, PortalPage | No | Yes | customer_self_service | P0 |
| `/customer/support/[id]` | `src/app/(dashboard)/customer/support/[id]/page.tsx` | customer | customer · operational UI | forms | PortalPage | No | Later | detail_page | P2 |
| `/customer/support/new` | `src/app/(dashboard)/customer/support/new/page.tsx` | customer | customer · operational UI | forms | PortalPage | No | Later | transaction_form | P2 |
| `/customer/support` | `src/app/(dashboard)/customer/support/page.tsx` | customer | customer · operational UI | table shell | PortalPage | No | Later | customer_self_service | P2 |
| `/partner/collection-requests` | `src/app/(dashboard)/partner/collection-requests/page.tsx` | partner | partner · operational UI | table shell | DataTableShell, PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/partner/collections/[id]` | `src/app/(dashboard)/partner/collections/[id]/page.tsx` | partner | partner · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/partner/collections/create` | `src/app/(dashboard)/partner/collections/create/page.tsx` | partner | partner · operational UI | custom/portal | (see imports in file) | No | Later | transaction_form | P2 |
| `/partner/collections` | `src/app/(dashboard)/partner/collections/page.tsx` | partner | partner · operational UI | KPI grid + table shell | KpiCard, QuickActionGrid, WorkflowCard, DataTableShell, DetailPanel, PortalPage | Yes | Yes | partner_vendor_workspace | P0 |
| `/partner/commisions` | `src/app/(dashboard)/partner/commisions/page.tsx` | partner | partner · operational UI | custom/portal | (see imports in file) | No | Later | partner_vendor_workspace | P2 |
| `/partner/commissions` | `src/app/(dashboard)/partner/commissions/page.tsx` | partner | partner · operational UI | custom/portal | (see imports in file) | No | Later | partner_vendor_workspace | P2 |
| `/partner/customers/[id]` | `src/app/(dashboard)/partner/customers/[id]/page.tsx` | partner | partner · operational UI | table shell | PortalPage | No | Later | detail_page | P2 |
| `/partner/customers` | `src/app/(dashboard)/partner/customers/page.tsx` | partner | partner · operational UI | KPI grid + table shell + forms | KpiCard, QuickActionGrid, WorkflowCard, DataTableShell, DetailPanel, PortalPage | Yes | Yes | partner_vendor_workspace | P0 |
| `/partner/finance` | `src/app/(dashboard)/partner/finance/page.tsx` | partner | partner · operational UI | custom/portal | PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/partner/notifications` | `src/app/(dashboard)/partner/notifications/page.tsx` | partner | partner · operational UI | custom/portal | (see imports in file) | No | Later | partner_vendor_workspace | P2 |
| `/partner` | `src/app/(dashboard)/partner/page.tsx` | partner | partner · operational UI | forms | PortalPage | No | Yes | partner_vendor_workspace | P0 |
| `/partner/payments/[id]` | `src/app/(dashboard)/partner/payments/[id]/page.tsx` | partner | partner · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/partner/payments` | `src/app/(dashboard)/partner/payments/page.tsx` | partner | partner · operational UI | table shell | PortalPage | No | Yes | partner_vendor_workspace | P0 |
| `/partner/payouts` | `src/app/(dashboard)/partner/payouts/page.tsx` | partner | partner · operational UI | custom/portal | (see imports in file) | No | Later | partner_vendor_workspace | P2 |
| `/partner/reports` | `src/app/(dashboard)/partner/reports/page.tsx` | partner | partner · operational UI | table shell | PortalPage | No | Later | report_analytics | P2 |
| `/partner/subscription-requests/[id]` | `src/app/(dashboard)/partner/subscription-requests/[id]/page.tsx` | partner | partner · operational UI | custom/portal | PortalPage | No | Later | detail_page | P2 |
| `/partner/subscription-requests/create` | `src/app/(dashboard)/partner/subscription-requests/create/page.tsx` | partner | partner · operational UI | forms | PortalPage | No | Later | transaction_form | P2 |
| `/partner/subscription-requests` | `src/app/(dashboard)/partner/subscription-requests/page.tsx` | partner | partner · operational UI | custom/portal | PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/partner/subscriptions/[id]` | `src/app/(dashboard)/partner/subscriptions/[id]/page.tsx` | partner | partner · operational UI | table shell | PortalPage | No | Later | detail_page | P2 |
| `/partner/subscriptions` | `src/app/(dashboard)/partner/subscriptions/page.tsx` | partner | partner · operational UI | table shell + forms | PortalPage | No | Yes | partner_vendor_workspace | P0 |
| `/vendor/documents` | `src/app/(dashboard)/vendor/documents/page.tsx` | vendor | vendor · operational UI | custom/portal | PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/vendor/ledger` | `src/app/(dashboard)/vendor/ledger/page.tsx` | vendor | vendor · operational UI | custom/portal | PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/vendor/notifications` | `src/app/(dashboard)/vendor/notifications/page.tsx` | vendor | vendor · operational UI | custom/portal | (see imports in file) | No | Later | partner_vendor_workspace | P2 |
| `/vendor/orders` | `src/app/(dashboard)/vendor/orders/page.tsx` | vendor | vendor · operational UI | custom/portal | PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/vendor/outstanding` | `src/app/(dashboard)/vendor/outstanding/page.tsx` | vendor | vendor · operational UI | custom/portal | PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/vendor` | `src/app/(dashboard)/vendor/page.tsx` | vendor | vendor · operational UI | KPI grid | KpiCard, QuickActionGrid, PortalPage | Yes | Yes | partner_vendor_workspace | P0 |
| `/vendor/products` | `src/app/(dashboard)/vendor/products/page.tsx` | vendor | vendor · operational UI | forms | PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/vendor/profile` | `src/app/(dashboard)/vendor/profile/page.tsx` | vendor | vendor · operational UI | custom/portal | PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/vendor/purchase-returns` | `src/app/(dashboard)/vendor/purchase-returns/page.tsx` | vendor | vendor · operational UI | custom/portal | PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/vendor/quotes/[id]` | `src/app/(dashboard)/vendor/quotes/[id]/page.tsx` | vendor | vendor · operational UI | forms | PortalPage | No | Later | detail_page | P2 |
| `/vendor/quotes` | `src/app/(dashboard)/vendor/quotes/page.tsx` | vendor | vendor · operational UI | custom/portal | PortalPage | No | Later | partner_vendor_workspace | P2 |
| `/about` | `src/app/(public)/about/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Yes | public_marketing | P0 |
| `/apply` | `src/app/(public)/apply/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/blog/[slug]` | `src/app/(public)/blog/[slug]/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/blog` | `src/app/(public)/blog/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/contact` | `src/app/(public)/contact/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Yes | public_marketing | P0 |
| `/direct-sale` | `src/app/(public)/direct-sale/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/how-it-works` | `src/app/(public)/how-it-works/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Yes | public_marketing | P0 |
| `/lease` | `src/app/(public)/lease/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/lucky-plan/fair-draw/[id]` | `src/app/(public)/lucky-plan/fair-draw/[id]/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/lucky-plan/fair-draw` | `src/app/(public)/lucky-plan/fair-draw/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/lucky-plan` | `src/app/(public)/lucky-plan/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Yes | public_marketing | P0 |
| `/` | `src/app/(public)/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Yes | public_marketing | P0 |
| `/policies` | `src/app/(public)/policies/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/products/[id]` | `src/app/(public)/products/[id]/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/products` | `src/app/(public)/products/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Yes | public_marketing | P0 |
| `/rent` | `src/app/(public)/rent/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/vision-trust` | `src/app/(public)/vision-trust/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/winner-history` | `src/app/(public)/winner-history/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Later | public_marketing | P2 |
| `/winners` | `src/app/(public)/winners/page.tsx` | public | Marketing / trust / information | custom/portal | (see imports in file) | No | Yes | public_marketing | P0 |
| `/profile` | `src/app/profile/page.tsx` | utility | utility · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/settings` | `src/app/settings/page.tsx` | utility | utility · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |
| `/unauthorized` | `src/app/unauthorized/page.tsx` | utility | utility · operational UI | custom/portal | (see imports in file) | No | Later | register_list | P2 |

## App Router `layout.tsx` files

| File (under `frontend/`) | Notes |
| --- | --- |
| `src/app/(auth)/layout.tsx` | Route group / segment layout |
| `src/app/(dashboard)/admin/layout.tsx` | Route group / segment layout |
| `src/app/(dashboard)/cashier/layout.tsx` | Route group / segment layout |
| `src/app/(dashboard)/customer/layout.tsx` | Route group / segment layout |
| `src/app/(dashboard)/layout.tsx` | Route group / segment layout |
| `src/app/(dashboard)/partner/layout.tsx` | Route group / segment layout |
| `src/app/(dashboard)/vendor/layout.tsx` | Route group / segment layout |
| `src/app/(public)/layout.tsx` | Route group / segment layout |
| `src/app/layout.tsx` | Route group / segment layout |

## Route protection (frontend)

- No Next.js `middleware.ts` is present under `frontend/`. Role separation is enforced via dashboard route groups, existing auth/session flows, and backend APIs (see layouts and server-side checks).

## Navigation configuration

- `frontend/src/config/navigation.ts` — `groupedNavigationByRole` (ADMIN from `admin-route-registry`, PARTNER/CUSTOMER/CASHIER/VENDOR static trees).
- `frontend/src/config/admin-route-registry.ts` — admin sidebar route tree source.
- `frontend/src/lib/routes.ts` — canonical path constants (`ROUTES`).
