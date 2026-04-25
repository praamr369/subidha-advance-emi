# Data Onboarding Checklist (Safe, Non-Breaking)

Use this before loading real business data into a fresh or reset environment.

## 1) Guardrails

- Keep live data files outside git.
- Use only preview-first import paths for supported CSV domains.
- Do not insert subscriptions/payments/EMIs by direct SQL.
- Take DB backup/snapshot before onboarding.

## 2) Recommended onboarding order

1. Branches and counters
2. Products
3. Inventory foundation (locations/profiles/opening stock)
4. Customers
5. Batches and lucky IDs
6. Subscriptions (controlled create flow/API)

## 3) Customer onboarding checklist

- Template: `docs/imports/customer-import-template.csv`
- Validate: `python manage.py validate_customer_import_csv <csv_path> --fail-on-errors`
- Preview: `POST /api/v1/admin/customers/import/preview/`
- Commit: `POST /api/v1/admin/customers/import-csv/`
- Required columns: `name,phone,email`

## 4) Product onboarding checklist

- Template: `docs/imports/product-import-template.csv`
- Validate: `python manage.py validate_product_import_csv <csv_path> --fail-on-errors`
- Preview: `POST /api/v1/admin/products/import-preview/`
- Commit: `POST /api/v1/admin/products/import-csv/`
- Required columns: `name,base_price`

## 5) Subscription onboarding checklist

- Reference template: `docs/imports/subscription-import-template.csv`
- Use only controlled create flow:
  - UI: `/admin/subscriptions/create`
  - API: `POST /api/v1/admin/subscriptions/`
- No confirmed bulk subscription CSV importer should be assumed in current production path.
- Ensure `customer`, `product`, `batch`, and `lucky_id` relationships are valid before create.

## 6) Post-load checks

- Spot-check one record each: customer, product, batch, subscription.
- Verify subscription totals and EMI schedule presence.
- Verify cashier can locate and collect pending EMI correctly.
- Run reconciliation review before go-live sign-off.
