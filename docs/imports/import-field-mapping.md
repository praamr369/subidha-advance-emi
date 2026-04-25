# Import Field Mapping (Current Contracts)

This mapping is intentionally limited to customer/product/subscription onboarding surfaces requested for this pack.

## 1) Customer CSV template

Template file: `docs/imports/customer-import-template.csv`

### Required headers

- `name`
- `phone`
- `email`

### Code-aligned behavior

- Validation helper: `validate_customer_import_csv`
- Preview endpoint: `POST /api/v1/admin/customers/import/preview/`
- Import endpoint: `POST /api/v1/admin/customers/import-csv/`
- Upload duplicates (`phone`/`email`) are rejected.
- Existing customer phone and existing user email collisions are rejected.
- Import creates customer + linked user; username is auto-generated.

## 2) Product CSV template

Template file: `docs/imports/product-import-template.csv`

### Required headers

- `name`
- `base_price`

### Optional headers

- `product_code`
- `category`
- `sub_category` (import alias for subcategory)
- `sku`
- `unit_of_measure`
- `description`
- `image`

### Code-aligned behavior

- Validation helper: `validate_product_import_csv`
- Preview endpoint: `POST /api/v1/admin/products/import-preview/`
- Import endpoint: `POST /api/v1/admin/products/import-csv/`
- Match/update precedence: `product_code`, then case-insensitive `name`.
- Blank metadata cells are non-destructive on update.
- Pricing remains required and financially meaningful for subscription amount derivation.

## 3) Subscription onboarding reference template

Template file: `docs/imports/subscription-import-template.csv`

This file is a **reference mapping file**, not a bulk importer contract.

### API create fields represented

- `customer` (customer id)
- `product` (product id)
- `batch` (batch id, required for EMI)
- `lucky_id` (optional for EMI; auto-assigned if omitted)
- `partner` (optional partner user id)
- `plan_type` (`EMI` / `RENT` / `LEASE`)
- `tenure_months`
- `start_date` (`YYYY-MM-DD`)

### Important constraints

- `plan_type=EMI`: requires `batch`; tenure must equal batch duration.
- `lucky_id`, if supplied, must belong to selected batch and be available.
- `plan_type=RENT/LEASE`: `batch` and `lucky_id` must be blank/null.
- `total_amount` and `monthly_amount` are computed server-side; do not import as inputs.
