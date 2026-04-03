# Data Onboarding Checklist

Use this checklist before loading business data into a new or cleaned environment.

## 1. Before importing anything

- Confirm you are not pointing at a live production database by mistake.
- Take a database backup or snapshot before major onboarding.
- Keep raw business spreadsheets, customer lists, and signed source documents outside the git repository.
- Use the templates in `docs/imports/` only as formatting guides, not as storage for live data.

## 2. Prepare master data in this order

1. Internal users
2. Partner users
3. Products
4. Batches
5. Lucky IDs for each batch
6. Customers
7. Subscriptions

## 3. Product onboarding checklist

- Verify each product has a stable business name.
- Verify each product has the correct base price.
- Prepare category and sub-category labels consistently.
- After import, review the product flags for active/EMI/rent/lease capability because those are not controlled by the CSV importer.

## 4. Customer onboarding checklist

- Normalize name spelling before import.
- Normalize phone numbers before import.
- Deduplicate by phone before import.
- Decide whether the customer only needs profile data or also needs portal login credentials.
- If portal login is required, prefer admin create flow or plan a password reset after CSV import.

## 5. Subscription onboarding checklist

- Confirm the customer record already exists.
- Confirm the product record already exists.
- Confirm the batch exists and is the correct batch for the sale.
- Confirm the batch duration matches intended tenure.
- Confirm the lucky ID is available if you plan to specify one explicitly.
- Do not attempt bulk subscription CSV import as an assumed supported feature. Use the existing create flow or a separately approved migration path.

## 6. Safe use of current import paths

- Customer CSV:
  Preview first, then import.
- Product CSV:
  Import into a non-live environment first when possible.
- Subscription CSV template:
  Use only as a reference file for structured onboarding or API staging because no current bulk importer was confirmed.

## 7. Post-load validation

- Spot-check at least one customer, one product, one batch, and one subscription.
- Confirm subscription totals and monthly amounts look correct.
- Confirm EMI schedules exist for Lucky Plan EMI subscriptions.
- Confirm the selling batch still has the correct available lucky IDs after onboarding.
- Run the release-candidate validation flow before sign-off in staging.

## 8. Storage guidance for live onboarding files

- Keep live CSVs, raw exports, KYC packets, signed forms, and customer source lists outside the repository.
- Recommended locations:
  encrypted shared drive, secret-managed object storage, or an ops-owned directory such as `/srv/subidha-private/onboarding/`.
- Keep only blank templates and field-mapping documentation in git.
