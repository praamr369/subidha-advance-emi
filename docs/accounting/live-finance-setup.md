# Live finance setup (SUBIDHA CORE)

## FinanceAccount vs ChartOfAccount

- **FinanceAccount** rows represent operational settlement instruments your cashiers and bankers touch every day: physical cash desks, bank accounts you sweep into, live UPI IDs, and payment-gateway settlement wallets.
- **ChartOfAccount** rows describe ledger anatomy (assets, liabilities, income, expense, equity). Income streams (EMI vs rent vs lease vs retail), liabilities such as deposits payable, commission owed, or customer advances, and inventory valuation all belong **on the chart**, accessed through **purpose mappings**.

Income, liabilities, waiver buckets, commission payable, and inventory asset balances must **not** be modeled as fake settlement FinanceAccounts. Legacy tenants may still carry historical rows—those stay untouched—but new bootstrap flows create:

1. Real settlement desks flagged `is_real_settlement_account=true`.
2. A single non-settlement anchor (`Ledger posting profiles (system)`) whose sole job is to satisfy `FinanceAccountCoaMapping.finance_account` for ledger-only purposes while mapping each purpose to the correct COA row.

## Bootstrap behaviour

`AccountingSetupService.bootstrap`:

1. Seeds additive COA system codes (furniture EMI/rent/lease/retail/inventory defaults).
2. Creates settlement finance desks plus the ledger anchor.
3. Creates default mappings including gateway settlement purposes and HR/expense anchors where seeded.

Dry-run (`dry_run=true`) never persists rows but returns the same validation envelope.

## Admin signals

- `GET /api/v1/admin/accounting/setup/status/` exposes `missing_required_accounts`, `missing_required_mappings`, settlement readiness flags, and structured warnings (conceptual desks, duplicate defaults, wrong COA types, unmapped desks).

## Before go-live

1. Confirm every settlement desk maps to an ASSET COA via cash/UPI/bank/gateway collection purposes.
2. Confirm ledger anchor exists and ledger-only purposes reference it—not operational desks.
3. Resolve warnings flagged `MAPPING_ACCOUNT_TYPE_MISMATCH` or `DUPLICATE_DEFAULT_MAPPING`.
4. Review inactive legacy FinanceAccounts rather than deleting them; deactivate through controlled masters updates when unused.
