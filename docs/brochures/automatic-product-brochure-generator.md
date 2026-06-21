# Automatic Product Brochure Generator

## Business purpose

Phase BROCHURE-1 gives admin, cashier, and staff users a fast way to create
customer-facing PDF catalogs from the existing product master. It supports rent,
lease, Lucky EMI, direct sale, and hand-picked product brochures without turning
catalog sharing into an order, reservation, contract, or financial event.

Generated documents store a product snapshot. A brochure therefore continues to
show the price and customer-safe product details that were approved when it was
generated, even if the current product master changes later.

## Brochure types

- `RENT`: products enabled for rent with a positive brochure monthly rent.
- `LEASE`: products enabled for lease with a positive brochure monthly amount.
- `LUCKY_EMI`: EMI-enabled products with a positive existing base price.
- `DIRECT_SALE`: direct-sale-enabled products with a positive existing base price.
- `CUSTOM`: explicitly selected products with at least one brochure-safe offering.

All types require an active product, public brochure visibility, a usable name,
and a safe availability result. Discontinued, maintenance, hidden, archived, and
known out-of-stock products are excluded. A product without an inventory profile
is labelled “Availability on request” rather than being treated as unavailable.

## Product brochure settings

`ProductBrochureSettings` must be created and reviewed before a product can
appear in any brochure. Existing products are not published merely because they
exist in the product master.

Recommended minimum customer-facing data:

- product name;
- category;
- product code;
- `visible_on_public_catalog` plus the relevant type visibility flag;
- monthly rent, monthly lease amount, or existing sale/base price for the
  selected brochure type;
- security deposit for rent and lease products;
- short description;
- product image, when available.

Rent and lease products require a positive brochure-specific monthly amount.
Lucky EMI and direct-sale brochures use the existing positive product base price
without changing its contract or sale semantics.

## Operator flow

1. Open **Admin → Product Brochures**.
2. Select Rent, Lease, Lucky EMI, Direct Sale, or Custom.
3. Optionally enter a category.
4. For Custom, select the required product rows.
5. Confirm the customer-facing title and generate the PDF.
6. Download the PDF, copy the public link, or copy the prepared WhatsApp message.
7. Use the recent brochure list to re-open an existing generated snapshot.

## API endpoints

Internal endpoints require an authenticated `ADMIN`, `CASHIER`, or `STAFF` role.

- `GET /api/v1/admin/brochures/products/?brochure_type=RENT`
- `POST /api/v1/admin/brochures/preview/`
- `POST /api/v1/admin/brochures/generate/`
- `GET /api/v1/admin/brochures/`
- `GET /api/v1/admin/brochures/{id}/`

Public endpoint:

- `GET /api/v1/public/brochures/{public_token}/`

The public response contains brochure metadata, customer-safe product snapshots,
and the PDF URL. It never exposes customer data, internal product cost, stock
ledger IDs/rows, purchase cost, supplier/vendor data, accounting account IDs,
private user data, or internal filter implementation details.

Example generation payload:

```json
{
  "brochure_type": "RENT",
  "title": "Subidha Furniture Rent Catalog",
  "category": null,
  "product_ids": [],
  "expires_at": null
}
```

If `product_ids` is non-empty, the persisted document type is `CUSTOM`. Safety
and visibility rules still apply; selecting an ID cannot force a hidden or
unpriced product into a brochure.

## Data safety and read-only boundary

Brochure generation reads:

- product identity, category, description, and current public selling price;
- additive brochure visibility, rent, lease, deposit, badge, and ordering fields;
- safe inventory availability only;
- active business profile branding/contact details.

It writes only:

- `BrochureDocument`;
- its generated PDF file;
- its immutable-in-spirit `product_snapshot`;
- optional `ProductBrochureSettings` maintained separately by administrators.

It does **not**:

- change EMI calculations or schedules;
- post or reverse payments;
- generate receipts;
- create invoices, direct sales, subscriptions, or contracts;
- create journals, accounting bridge records, or reconciliation entries;
- reserve/release stock or create stock ledger movements;
- change product base-price semantics.

## WhatsApp sharing workflow

The generate response returns a prepared message:

```text
Hello, please check our latest Subidha Furniture product catalog:
{public_url}

You can rent, lease, buy directly, or ask for Lucky EMI options depending on product availability.
Prices are indicative until final confirmation.
```

The operator copies the message from the admin page and sends it through the
business’s approved WhatsApp workflow. Phase BROCHURE-1 does not automatically
send messages or create customer/enquiry records.

## Deployment checklist

Before deployment:

1. Back up the PostgreSQL database.
2. Back up the configured `MEDIA_ROOT`, including any existing `brochures/`
   directory.
3. Confirm `brochures` is present in `INSTALLED_APPS`.
4. Confirm `/api/v1/admin/brochures/` and
   `/api/v1/public/brochures/` are mounted.
5. Confirm production media storage is persistent across releases.
6. Confirm the web server, reverse proxy, CDN, or object storage serves
   `MEDIA_URL`. Django's development `static(..., document_root=MEDIA_ROOT)`
   helper is active only when `DEBUG=True` and is not a production media
   strategy.

Run the additive migration:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py migrate brochures
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

Permission check:

- unauthenticated users must be rejected from admin brochure endpoints;
- `CUSTOMER`, `PARTNER`, and `VENDOR` roles must be rejected;
- authenticated `ADMIN`, `CASHIER`, and `STAFF` roles may use the internal
  brochure endpoints;
- the public token endpoint must work without authentication and return only
  brochure-safe fields.

Sample API/UI smoke test:

1. Open `/admin/brochures` as an allowed internal user.
2. Generate one `RENT` brochure from a configured rent-visible product with a
   positive monthly rent and recommended security deposit.
3. Open its PDF and verify branding, product, rent, deposit, terms, and footer.
4. Open its public token URL in a signed-out browser.
5. Generate one `DIRECT_SALE` brochure from a configured sale-visible product.
6. Verify the PDF shows the public sale price and no cost, account, vendor,
   customer, or stock-ledger data.
7. Copy the public link and WhatsApp message.
8. Confirm invoice, receipt, payment, subscription, EMI, journal, direct-sale,
   return, credit-note, and stock-ledger counts did not change.

Production acceptance checklist:

- [ ] Database backup completed.
- [ ] Media backup completed.
- [ ] Migration applied successfully.
- [ ] Persistent media/PDF serving verified.
- [ ] Admin/cashier/staff permissions verified.
- [ ] Public anonymous access and safe payload verified.
- [ ] One RENT brochure generated and opened.
- [ ] One DIRECT_SALE brochure generated and opened.
- [ ] No operational or financial side effects observed.

## Validation commands and known baseline notes

Valid backend commands for this checkout:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.\.venv\Scripts\python.exe manage.py test tests.brochures --verbosity=1
.\.venv\Scripts\python.exe manage.py test tests.inventory tests.billing tests.subscriptions --verbosity=1
```

No standalone product test package exists in this checkout; use only the valid
test modules shown above.

Frontend:

```powershell
cd frontend
npm run typecheck
npm run build:smoke
```

When the repository-wide lint baseline is noisy, run focused lint against:

```text
src/app/(dashboard)/admin/brochures/page.tsx
src/services/brochures.ts
```

Closeout validation found that focused brochure lint passes. Repository-wide
lint still reports unrelated pre-existing React hook/compiler findings outside
the brochure files.

The exact large backend regression command can spend substantial time replaying
the full migration history. An accelerated current-schema run executed 666
inventory/billing/subscription tests but produced 16 pre-existing/unrelated
rent/lease accounting errors because migration-only raw SQL columns are not
available in that accelerated profile. These failures are not hidden and are not
caused by brochure code; authoritative regression should use the normal migrated
PostgreSQL test environment.

## Rollback

The migration is additive: it creates the brochure settings and document tables
and does not backfill or modify products, subscriptions, EMIs, payments,
inventory, reconciliation, or accounting records.

Before rollback, preserve generated PDFs and brochure snapshots required for
business history. Remove frontend/API exposure first, then reverse the brochure
migration only after confirming the business no longer needs those records.
Rolling back the brochure app does not require rewriting finance, inventory, or
subscription data.

## Future upgrade path

- QR code per product and per brochure.
- Customer enquiry tracking from public brochure links.
- Explicit, audited quote-to-subscription or quote-to-direct-sale conversion.
- Public rental/lease marketplace catalog with search and availability windows.
- Brochure expiry/revocation controls and access analytics.
