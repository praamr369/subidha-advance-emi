# First-Run Business Operating Setup (SUBIDHA CORE)

This document describes the canonical “Start from Zero” setup flow after a controlled business reset or a fresh installation, using the existing SUBIDHA CORE modules.

The workflow is designed to be:

- operationally practical for a real furniture shop
- financially safe
- auditable
- backward compatible
- future-ready for rent/lease without forcing inventory CSV import today

## Entry points in the UI

After logging in as an ADMIN, use:

- `/admin/settings/business-setup` — Start from Zero cockpit
- `/admin/setup/readiness` — detailed categorized readiness
- `/admin/settings/business-setup/checklist` — legacy checklist view
- `/admin/settings/business-setup/dry-runs` — read-only validation checks
- `/admin/settings/business-setup/reset` — typed reset/backup/restore workflow

Setup and reset controls are admin-only. Customer, partner, cashier, vendor, and staff roles must not receive these controls.

## Readiness categories

Fresh-start setup readiness is normalized into these categories:

1. `REQUIRED_FOR_COLLECTION`
2. `REQUIRED_FOR_ACCOUNTING_POSTING`
3. `REQUIRED_FOR_DOCUMENTS`
4. `REQUIRED_FOR_OPERATIONS`
5. `RECOMMENDED_FOR_GO_LIVE`
6. `OPTIONAL_OR_FUTURE`

## First operational start requirements

Before live collection, configure or repair:

- business profile
- active admin user
- at least one active branch
- at least one active cash/counter/collection finance account
- core Chart of Accounts
- FinanceAccount-to-COA mapping for real collection accounts
- document numbering setup
- minimal print branding
- product/catalog route readiness
- accounting bridge readiness access

The safe **Ensure Fresh Start Setup** action may repair setup master data only:

- default COA
- default FinanceAccounts
- FinanceAccountCoaMappings
- default branch
- default cash counter where safe
- default document numbering setup profiles
- minimal print branding settings object
- accounting setup metadata

It must not create:

- Payment
- ReceiptDocument
- JournalEntry
- MoneyMovement
- SettlementAllocation
- ReconciliationItem
- StockLedger
- OpeningStock
- SalaryPayment
- Commission
- PayoutBatch
- customer contracts
- subscriptions
- direct-sale invoices

## Recommended order

### 1) Business profile

Route:

- `/admin/settings/business-setup/profile`

Configure legal name, trade name, phone, email, address, tax mode, optional GSTIN/PAN/Udyam/MSME, and document footer data.

GSTIN, PAN, Udyam/MSME, and website are optional unless the selected tax/compliance mode requires them.

### 2) Branch and counter setup

Routes:

- `/admin/settings/business-setup/branches`
- `/admin/settings/business-setup/cash-desks`
- `/admin/branches`
- `/admin/counters`

Minimum requirement:

- at least one active branch
- at least one active collection counter
- at least one active collection-ready FinanceAccount

### 3) Finance and accounting setup

Routes:

- `/admin/accounting/setup`
- `/admin/settings/business-setup/finance-accounts`
- `/admin/accounting/bridges`
- `/admin/accounting/bridge-reconciliation`
- `/admin/settings/business-setup/document-numbering`

Minimum setup includes core COA, cash/bank/UPI ASSET accounts, receivable/income/liability/expense accounts, and mapping for controlled posting.

Accounting bridge readiness is read-only. It may show a row as postable, but actual posting must remain through explicit approved bridge/posting workflows.

### 4) Documents and branding

Routes:

- `/admin/settings/business-setup/document-numbering`
- `/admin/settings/business-setup/print-branding`

Stable document numbering and minimal print branding are required before issuing customer-facing evidence documents.

### 5) Products

Route:

- `/admin/products`

Create active products with correct base price. Existing contract pricing snapshots must not be mutated by later product edits.

### 6) Staff and HR

Routes:

- `/admin/settings/business-setup/staff`
- `/admin/hr/staff`

Staff setup is recommended unless payroll is actively used. Accounting/finance setup controls remain admin-only.

### 7) Inventory onboarding

Routes:

- `/admin/inventory/readiness`
- `/admin/inventory/opening-stock`

Inventory opening stock is not a hard blocker for starting core EMI/direct-sale/rent-lease collection.

Current shop stock may be on pen and paper. Therefore:

- stock upload is not required for initial system setup
- opening stock can be entered manually later
- CSV import is optional/future
- inventory accounting readiness may remain onboarding-pending
- stock availability must not be faked
- readiness pages must not create StockLedger or OpeningStock records

## Reset and dry-run safety

Dry-run preview is read-only. Reset/restore actions require typed confirmation and must preserve the required admin username when the workflow requires it.

Use:

- `/admin/settings/business-setup/dry-runs`
- `/admin/settings/business-setup/reset`

Backup/restore lists must show real job rows or empty states. Do not add fake backup rows.

## Unsupported future workflows

Keep the following visible but non-blocking for initial operations unless implemented for real:

- Staff Advance workflow
- full manufacturing costing
- advanced inventory valuation
- backdated journal import
- bulk CSV stock import

Staff Advance must remain unsupported/non-postable until a real audited StaffAdvance source workflow exists.
