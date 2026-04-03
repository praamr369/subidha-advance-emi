# First Live Onboarding Runbook

This runbook is the current safest first-live onboarding path for SUBIDHA CORE based on the code that exists today.

It is intentionally conservative:

- no financial posting
- no payment collection
- no lucky draw execution
- no commission or payout actions
- no unsupported bulk subscription import

Use this runbook to load products, customers, batches, and initial subscriptions without weakening auditability or financial controls.

## 1. Confirm what is actually operational today

### Backend capabilities confirmed in code

- Customer CSV preview is operational:
  `POST /api/v1/admin/customers/import/preview/`
- Customer CSV import commit is operational:
  `POST /api/v1/admin/customers/import-csv/`
- Product CSV import is operational:
  `POST /api/v1/admin/products/import-csv/`
- Batch creation is operational:
  `POST /api/v1/admin/batches/`
- Subscription creation is operational:
  `POST /api/v1/admin/subscriptions/`
- Lucky IDs are auto-generated on batch creation by signal logic when the batch is created with `total_slots=100`.

### Frontend capabilities confirmed in code

- Product import page is operational:
  `/admin/products/import`
- Batch create page is operational:
  `/admin/batches/create`
- Admin subscription create page is operational:
  `/admin/subscriptions/create`
- Customer create page is operational:
  `/admin/customers/create`
- Customer register page supports search/filter/export, but the main current page does not expose a live confirm-import button for customer CSV commit.

### Important gaps you must respect

- No confirmed bulk subscription CSV importer exists in the current code.
- The dedicated frontend Lucky ID generation page points to `/admin/batches/{id}/generate-lucky-ids/`, but no confirmed backend endpoint exists for that route.
- Customer CSV import creates usernames server-side but does not return generated passwords.

## 2. Preflight before touching live onboarding

1. Confirm you are on the intended environment and database.
2. Take a backup or snapshot before first live onboarding.
3. Keep all real CSVs outside git.
4. Prepare data using the reference templates in `docs/imports/`.
5. Validate CSV files before using any import endpoint.

## 3. Run the read-only validators first

From `backend/`:

```bash
../.venv/bin/python manage.py validate_product_import_csv /secure/onboarding/products.csv --fail-on-errors
../.venv/bin/python manage.py validate_customer_import_csv /secure/onboarding/customers.csv --fail-on-errors
```

After batch creation, validate batch and Lucky ID readiness:

```bash
../.venv/bin/python manage.py validate_batch_setup --batch-id <BATCH_ID> --fail-on-errors
```

What these commands do:

- They are read-only.
- They do not create, update, reverse, or post financial records.
- They only validate CSV shape, row safety, and batch/Lucky ID readiness against current code contracts.

## 4. Product onboarding

### Safest order

1. Prepare `products.csv` from `docs/imports/product-import-template.csv`.
2. Run `validate_product_import_csv`.
3. Import through `/admin/products/import` or `POST /api/v1/admin/products/import-csv/`.
4. Review imported products in admin.

### Post-import review checklist

- Confirm `base_price` is correct.
- Confirm `product_code` is correct.
- Confirm `is_active` is correct.
- Confirm `is_emi_enabled` is correct.
- Confirm `is_rent_enabled` and `is_lease_enabled` are still correct.

Reason:

The product CSV importer creates or updates product metadata, but operational flags are not managed by the CSV import path.

## 5. Batch onboarding

### Current safe path

1. Create the batch from `/admin/batches/create`.
2. Use `total_slots=100`.
3. Prefer `status=DRAFT` first.
4. Save the batch.
5. Immediately run:

```bash
../.venv/bin/python manage.py validate_batch_setup --batch-id <BATCH_ID> --fail-on-errors
```

### What to expect after create

- The backend signal should auto-create Lucky IDs `00` through `99`.
- If the validator reports missing Lucky IDs, duplicate Lucky IDs, or a count mismatch, stop and fix that before selling.
- Do not rely on the dedicated frontend Lucky ID generation page for first live onboarding because that write endpoint is not confirmed in backend code.

### When the batch is ready

A batch is ready for live subscription onboarding only when:

- batch exists with the intended code and dates
- `total_slots=100`
- Lucky ID pool exists and is healthy
- batch validation command reports no blocking issues
- you intentionally move or keep the batch in the correct operational state for sales

## 6. Customer onboarding

### Option A: manual create in admin UI

Use this when customers need immediate login credentials or when the first live run is small.

Path:

- `/admin/customers/create`

Use this for:

- first small onboarding wave
- customers who need immediate portal access
- cases needing address/city/KYC handling at creation time

### Option B: CSV import through backend contract

Use this for profile preload only.

1. Prepare CSV from `docs/imports/customer-import-template.csv`.
2. Run:

```bash
../.venv/bin/python manage.py validate_customer_import_csv /secure/onboarding/customers.csv --fail-on-errors
```

3. Preview through:
   `POST /api/v1/admin/customers/import/preview/`
4. Commit through:
   `POST /api/v1/admin/customers/import-csv/`

Operational caution:

- The backend import endpoint is real.
- The main current admin customer page does not expose a live confirm-import control.
- Imported rows create customer users, but generated passwords are not returned.

If imported customers need portal login right away, do not treat CSV import as the final credential handoff step.

## 7. Subscription onboarding

### What is supported

- Manual admin creation from `/admin/subscriptions/create`
- Direct admin API create through `POST /api/v1/admin/subscriptions/`

### What is not supported

- Do not assume bulk subscription CSV import exists.

### Safest staged process

1. Prepare a staging sheet using `docs/imports/subscription-import-template.csv`.
2. Resolve and verify the real database ids for:
   - customer
   - product
   - batch
   - optional partner
   - optional lucky_id
3. Create subscriptions one by one through `/admin/subscriptions/create`.
4. After each creation, confirm:
   - customer is correct
   - product is correct
   - batch is correct for EMI
   - tenure matches batch duration
   - the created subscription has the expected total and monthly amount
   - EMI schedule exists

### EMI-specific caution

- For EMI onboarding, batch is required.
- Lucky ID must belong to the selected batch.
- If Lucky ID is left blank, the backend will auto-assign the next available Lucky ID.

## 8. First live run order

Use this order:

1. Products
2. Batches
3. Batch/Lucky ID validation
4. Customers
5. Subscriptions
6. Final spot-check before any payment collection

Do not collect money until the first set of created subscriptions has been checked in admin.

## 9. Final spot-check before live counter use

Check at least:

1. One imported product
2. One created batch
3. One batch validation command result
4. One customer created manually or imported
5. One subscription created from admin UI
6. One EMI schedule on that subscription

Only after those checks should the shop start live counter collection.
