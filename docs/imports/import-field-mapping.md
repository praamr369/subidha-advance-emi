# Import Field Mapping

This document maps the blank/reference CSV templates in `docs/imports/` to the current backend contracts and the read-only validation helpers that now exist in the repo.

## Safe import pattern

Use this pattern for every supported import:

1. Start from the blank template in `docs/imports/`.
2. Run the read-only validation command when one exists.
3. Use the admin preview endpoint or preview-first UI.
4. Post the import only after preview shows zero invalid rows.
5. Review the posted result summary and the affected master records.

Do not use any import path to create payment history, EMI postings, billing postings, accounting journals, or reconciliation shortcuts.

## 1. Customer import template

Template file:

- `docs/imports/customer-import-template.csv`

Current backend support:

- Validate: `python manage.py validate_customer_import_csv <csv_path> --fail-on-errors`
- Preview: `POST /api/v1/admin/customers/import/preview/`
- Import: `POST /api/v1/admin/customers/import-csv/`

Supported CSV headers from the current code:

| Header | Required | Notes |
| --- | --- | --- |
| `name` | Yes | Required by customer import validation |
| `phone` | Yes | Required, must be unique in the upload, and must not already exist |
| `email` | Yes | Required, must be unique in the upload, and must not already exist on a linked user |

Current behavior:

- Existing customers are rejected when the phone already exists.
- Import creates a customer user and customer profile.
- Import generates a username automatically.
- Import does not return the generated password in the response.

Operational recommendation:

- Use CSV import for profile preload only.
- If the imported customer needs immediate portal access, follow with OTP reset or controlled admin credential handoff.

## 2. Product import template

Template file:

- `docs/imports/product-import-template.csv`

Current backend support:

- Validate: `python manage.py validate_product_import_csv <csv_path> --fail-on-errors`
- Preview: `POST /api/v1/admin/products/import-preview/`
- Import: `POST /api/v1/admin/products/import-csv/`
- Admin UI: `/admin/products/import`

Supported headers from the current code:

| Header | Required | Notes |
| --- | --- | --- |
| `name` | Yes | Required by product CSV import |
| `base_price` | Yes | Required by product CSV import |
| `product_code` | No | Used for exact match first; generated for new products if blank |
| `category` | No | Optional catalog metadata |
| `sub_category` | No | Accepted alias for subcategory |
| `sku` | No | Optional SKU; reused by direct sale, billing, and downstream ops |
| `unit_of_measure` | No | Optional UOM; defaults safely when blank |
| `description` | No | Optional metadata |
| `image` | No | Optional image value passed through the importer |

Current behavior:

- Import may create or update products.
- Matching uses `product_code` first, then falls back to case-insensitive `name`.
- Blank metadata cells do not erase existing metadata on update.
- The importer does not manage `is_active`, `is_emi_enabled`, `is_rent_enabled`, or `is_lease_enabled`.
- The admin UI now requires uploaded-file preview before posting.

Operational recommendation:

- Review imported products in admin after import and confirm operational flags before selling.
- Do not use the legacy server-default CSV shortcut for go-live operations.

## 3. Vendor import template

Template file:

- `docs/imports/vendor-import-template.csv`

Current backend support:

- Validate: `python manage.py validate_vendor_import_csv <csv_path> --fail-on-errors`
- Preview: `POST /api/v1/accounting/imports/vendors/preview/`
- Import: `POST /api/v1/accounting/imports/vendors/post/`
- Admin UI: `/admin/settings/imports`

Supported headers from the current code:

| Header | Required | Notes |
| --- | --- | --- |
| `name` | Yes | Required vendor display name |
| `phone` | No | Matching helper when GSTIN is absent |
| `email` | No | Matching helper when GSTIN is absent |
| `address` | No | Optional address |
| `gstin` | No | Preferred unique match key when present |
| `state_code` | No | Optional tax-region metadata |
| `state_name` | No | Optional tax-region metadata |
| `is_active` | No | Defaults to `true` when blank |

Current behavior:

- Matching prefers `gstin`, then `email`, then `phone`, then safe exact-name match when unambiguous.
- Posting syncs the shared CRM party directory for vendor records.

Operational recommendation:

- Normalize GSTIN, email, and phone before import to avoid ambiguous rows.

## 4. Employee import template

Template file:

- `docs/imports/employee-import-template.csv`

Current backend support:

- Validate: `python manage.py validate_employee_import_csv <csv_path> --fail-on-errors`
- Preview: `POST /api/v1/accounting/imports/employees/preview/`
- Import: `POST /api/v1/accounting/imports/employees/post/`
- Admin UI: `/admin/settings/imports`

Supported headers from the current code:

| Header | Required | Notes |
| --- | --- | --- |
| `employee_code` | No for create, recommended | Safe match key for updates and branch-safe roster setup |
| `name` | Yes | Required for create and update |
| `phone` | Required for new rows | Alternate match key when `employee_code` is blank |
| `branch_code` | No | Falls back to the default branch when blank |
| `designation` | No | Workforce metadata |
| `department` | No | Workforce metadata |
| `joining_date` | Required for new rows | ISO date in `YYYY-MM-DD` format |
| `base_salary` | No | Decimal value |
| `standard_daily_hours` | No | Decimal value greater than zero |
| `overtime_rate_per_hour` | No | Decimal value, non-negative |
| `is_active` | No | Defaults to `true` when blank |
| `notes` | No | Optional notes |

Current behavior:

- Duplicate `employee_code` or `phone` rows in the same upload are rejected at preview time.
- Posted imports create or update `EmployeeProfile` records and sync the shared CRM party layer.
- Blank numeric cells on update do not erase existing salary/hour values.

Operational recommendation:

- Use `employee_code` consistently once staff codes are assigned.
- Import staff masters before starting payroll-period generation.

## 5. Branch import template

Template file:

- `docs/imports/branch-import-template.csv`

Current backend support:

- Validate: `python manage.py validate_branch_import_csv <csv_path> --fail-on-errors`
- Preview: `POST /api/v1/branch-control/imports/branches/preview/`
- Import: `POST /api/v1/branch-control/imports/branches/post/`
- Admin UI: `/admin/settings/imports`

Supported headers from the current code:

| Header | Required | Notes |
| --- | --- | --- |
| `code` | Yes | Unique branch code |
| `name` | Yes | Branch display name |
| `status` | No | `ACTIVE` or `INACTIVE`; defaults to `ACTIVE` |
| `is_primary` | No | Only one imported row may be primary |
| `phone` | No | Optional contact |
| `email` | No | Optional contact |
| `address` | No | Optional address |
| `notes` | No | Optional internal notes |

Current behavior:

- Duplicate branch codes in the same upload are rejected at preview time.
- Posting updates or creates branch masters and preserves the single-primary-branch rule.

Operational recommendation:

- Import branch masters before counters, stock locations, or staff assignments.

## 6. Counter import template

Template file:

- `docs/imports/counter-import-template.csv`

Current backend support:

- Validate: `python manage.py validate_counter_import_csv <csv_path> --fail-on-errors`
- Preview: `POST /api/v1/branch-control/imports/counters/preview/`
- Import: `POST /api/v1/branch-control/imports/counters/post/`
- Admin UI: `/admin/settings/imports`

Supported headers from the current code:

| Header | Required | Notes |
| --- | --- | --- |
| `code` | Yes | Unique counter/cash-desk code |
| `name` | Yes | Counter display name |
| `branch_code` | Yes | Must resolve to an existing branch |
| `finance_account_name` | Conditional | Required when `finance_chart_account_code` is blank |
| `finance_chart_account_code` | Conditional | Preferred deterministic finance-account match |
| `assigned_username` | No | Optional cashier assignment |
| `is_active` | No | Defaults to `true` when blank |
| `notes` | No | Optional notes |

Current behavior:

- Duplicate counter codes in the same upload are rejected at preview time.
- Finance account must be active and branch-compatible.
- Import creates or updates counter masters only. It never posts payment rows.

Operational recommendation:

- Prefer `finance_chart_account_code` over name matching in real multi-branch rollout files.

## 7. Subscription onboarding reference template

Template file:

- `docs/imports/subscription-import-template.csv`

Current backend support:

- Create API: `POST /api/v1/admin/subscriptions/`
- No confirmed bulk subscription CSV import endpoint exists in the current code.

Reference headers aligned to the create contract:

| Header | Required | Notes |
| --- | --- | --- |
| `customer` | Yes | Existing `Customer` primary key |
| `product` | Yes | Existing `Product` primary key |
| `batch` | Required for EMI | Existing `Batch` primary key |
| `lucky_id` | Optional for EMI | Existing `LuckyId` primary key; backend auto-assigns next available EMI lucky ID if blank |
| `partner` | No | Existing partner `User` primary key |
| `plan_type` | Yes | `EMI`, `RENT`, or `LEASE` |
| `tenure_months` | Yes | For EMI, must equal the selected batch duration |
| `start_date` | Yes | ISO date string such as `2026-04-01` |

Operational recommendation:

- Use this file as a staging/reference sheet for structured onboarding, not as proof of a supported bulk importer.

## 8. Safe template handling

- Keep these files blank or placeholder-only in git.
- Put real imports outside the repository.
- Preserve a separate signed-off copy of the business source file before transforming it into CSV for onboarding.
