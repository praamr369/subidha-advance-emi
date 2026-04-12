# Data Onboarding Checklist

Use this checklist before loading business data into a new or cleaned environment.

## 1. Before importing anything

- Confirm you are not pointing at a live production database by mistake.
- Take a database backup or snapshot before major onboarding.
- Keep raw business spreadsheets, customer lists, signed source documents, and real import CSVs outside the git repository.
- Use the templates in `docs/imports/` only as formatting guides, not as storage for live data.
- Follow the controlled pattern for every supported import:
  validate, preview, post, review.

## 2. Prepare setup data in this order

1. Internal users and cashier users
2. Branches
3. Counters / cash desks
4. Finance accounts that counters will map to
5. Products
6. Inventory profiles and stock locations
7. Vendors
8. Staff
9. Opening stock
10. Batches
11. Lucky IDs for each batch
12. Customers
13. Subscriptions through controlled create flow

## 3. Branch and counter rollout checklist

- Branch import:
  use `docs/imports/branch-import-template.csv`
- Counter import:
  use `docs/imports/counter-import-template.csv`
- Validate with:
  `python manage.py validate_branch_import_csv <csv_path> --fail-on-errors`
- Validate with:
  `python manage.py validate_counter_import_csv <csv_path> --fail-on-errors`
- Confirm every imported counter maps to the correct branch and finance account.
- Confirm every active cashier in a real multi-branch rollout is assigned to an active counter.

## 4. Product onboarding checklist

- Use `docs/imports/product-import-template.csv`.
- Validate with:
  `python manage.py validate_product_import_csv <csv_path> --fail-on-errors`
- Preview through `/admin/products/import`.
- Verify each product has the correct base price, SKU, unit of measure, category, and subcategory.
- After import, review the product flags for active/EMI/rent/lease capability because those are not controlled by the CSV importer.

## 5. Vendor and staff onboarding checklist

- Vendor import:
  use `docs/imports/vendor-import-template.csv`
- Staff import:
  use `docs/imports/employee-import-template.csv`
- Validate vendors with:
  `python manage.py validate_vendor_import_csv <csv_path> --fail-on-errors`
- Validate staff with:
  `python manage.py validate_employee_import_csv <csv_path> --fail-on-errors`
- Confirm vendor and staff masters carry the intended branch-safe metadata before procurement or payroll activity starts.

## 6. Opening stock checklist

- Do not load opening stock until products, inventory profiles, stock locations, and branches are already in place.
- Use the existing opening-stock preview/post workflow from `/admin/inventory/opening-stock`.
- Spot-check one raw-material profile and one finished-good profile before posting the full file.

## 7. Customer onboarding checklist

- Normalize name spelling before import.
- Normalize phone numbers and email addresses before import.
- Deduplicate by phone and email before import.
- Use `docs/imports/customer-import-template.csv`.
- Validate with:
  `python manage.py validate_customer_import_csv <csv_path> --fail-on-errors`
- Decide whether the customer only needs profile data or also needs portal login credentials.
- If portal login is required, prefer admin create flow or plan OTP/password-reset handoff after CSV import.

## 8. Subscription onboarding checklist

- Confirm the customer record already exists.
- Confirm the product record already exists.
- Confirm the batch exists and is the correct batch for the sale.
- Confirm the batch duration matches intended tenure.
- Confirm the lucky ID is available if you plan to specify one explicitly.
- Do not attempt bulk subscription CSV import as an assumed supported feature.
- Use the existing create flow or a separately approved migration path.

## 9. Safe use of current import paths

- Customer CSV:
  validate, preview, then import.
- Product CSV:
  validate, preview, then import.
- Vendor CSV:
  validate, preview, then import.
- Staff CSV:
  validate, preview, then import.
- Branch CSV:
  validate, preview, then import.
- Counter CSV:
  validate, preview, then import.
- Subscription CSV template:
  use only as a reference file for structured onboarding or API staging because no current bulk importer was confirmed.

## 10. Post-load validation

- Spot-check at least one branch, one counter, one product, one stock location, one vendor, one employee, one customer, one batch, and one subscription.
- Confirm branch/counter context appears correctly on collection surfaces before live cashier use.
- Confirm subscription totals and monthly amounts look correct.
- Confirm EMI schedules exist for Lucky Plan EMI subscriptions.
- Confirm the selling batch still has the correct available lucky IDs after onboarding.
- Run the full repo validation and the UAT checklist before sign-off.

## 11. Storage guidance for live onboarding files

- Keep live CSVs, raw exports, KYC packets, signed forms, and customer source lists outside the repository.
- Recommended locations:
  encrypted shared drive, secret-managed object storage, or an ops-owned directory such as `/srv/subidha-private/onboarding/`.
- Keep only blank templates and field-mapping documentation in git.
