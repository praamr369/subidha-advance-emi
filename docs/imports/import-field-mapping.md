# Import Field Mapping

This document maps the blank/reference CSV templates in `docs/imports/` to the current backend contracts.

## 1. Customer import template

Template file:

- `docs/imports/customer-import-template.csv`

Current backend support:

- Preview: `POST /api/v1/admin/customers/import/preview/`
- Import: `POST /api/v1/admin/customers/import-csv/`

Supported CSV headers from the current code:

| Header | Required | Notes |
| --- | --- | --- |
| `name` | Yes | Required by customer import validation |
| `phone` | Yes | Required by customer import validation and must be unique in the upload |

Current behavior:

- Existing customers are rejected when the phone already exists.
- Import creates a customer user and customer profile.
- Import generates a username automatically.
- Import does not return the generated password in the response.

Operational recommendation:

- Use CSV import for profile preload only.
- If the imported customer needs immediate portal access, follow with manual password reset or use the admin create-customer flow instead.

## 2. Product import template

Template file:

- `docs/imports/product-import-template.csv`

Current backend support:

- Import: `POST /api/v1/admin/products/import-csv/`

Supported headers from the current code:

| Header | Required | Notes |
| --- | --- | --- |
| `name` | Yes | Required by product CSV import |
| `base_price` | Yes | Required by product CSV import |
| `product_code` | No | Used for exact match first; generated for new products if blank |
| `category` | No | Optional metadata |
| `sub_category` | No | Accepted alias for subcategory |
| `description` | No | Optional metadata |
| `image` | No | Optional image value passed through the importer |

Current behavior:

- Import may create or update products.
- Matching uses `product_code` first, then falls back to case-insensitive `name`.
- Blank metadata cells do not erase existing metadata on update.
- The importer does not manage `is_active`, `is_emi_enabled`, `is_rent_enabled`, or `is_lease_enabled`.

Operational recommendation:

- Review imported products in admin after import and confirm operational flags before selling.

## 3. Subscription onboarding reference template

Template file:

- `docs/imports/subscription-import-template.csv`

Current backend support:

- Create API: `POST /api/v1/admin/subscriptions/`
- No confirmed bulk subscription CSV import endpoint was found in the current code.

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

Current behavior:

- `total_amount` is derived from `Product.base_price`.
- `monthly_amount` is derived by the backend.
- New subscriptions default to active operational status.
- For `EMI`, batch and lucky ID constraints are enforced by the backend.
- For `RENT` and `LEASE`, batch and lucky ID must remain blank.

Operational recommendation:

- Use this file as a staging/reference sheet for structured onboarding, not as proof of a supported bulk importer.

## 4. Safe template handling

- Keep these files blank or placeholder-only in git.
- Put real imports outside the repository.
- Preserve a separate signed-off copy of the business source file before transforming it into CSV for onboarding.
