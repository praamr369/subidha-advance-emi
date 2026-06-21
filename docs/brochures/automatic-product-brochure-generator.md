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

## BROCHURE-1B — Product Settings Manager

Open **Admin → Brochures → Product Settings** or use **Manage Product Brochure
Settings** from the brochure generator. This operational register replaces the
need to use Django admin for routine brochure publication setup.

### Enable one product

1. Search by product name or code.
2. Open **Edit** on the product row.
3. Enable **Public catalog**.
4. Enable only the required type catalogs: Rent, Lease, Lucky EMI, or Sale.
5. Enter the applicable brochure prices and security deposit.
6. Add a short public description, optional badge, featured status, and sort
   order.
7. Save and review any warnings.

Missing `ProductBrochureSettings` always means unpublished. When the settings
manager creates a row, every visibility flag starts disabled unless the operator
explicitly enables it. A partial update therefore cannot publish a product to
unrelated catalogs.

### Minimum fields by brochure type

- Rent: active rent-enabled product, public visibility, rent visibility, and a
  positive monthly rent. Security deposit is strongly recommended.
- Lease: active lease-enabled product, public visibility, lease visibility, and
  a positive lease monthly amount. Security deposit is strongly recommended.
- Lucky EMI: active EMI-enabled product, public visibility, Lucky EMI
  visibility, and the existing positive product base price.
- Direct Sale: active direct-sale-enabled product, public visibility, sale
  visibility, and the existing positive product base price.

Product name, code, category, short description, and image are recommended for
every customer-facing catalog.

### Bulk update

Select products in the settings register and use the bulk panel. Visibility
selectors default to **No change**; blank prices also mean no change. Bulk update
can create missing settings rows, but it enables only the visibility flags
explicitly selected by the operator.

Warnings are advisory rather than financial or stock actions. Typical warnings
identify visible rent/lease catalogs without monthly pricing or rent/lease
products without a brochure security deposit.

### Daily operator workflow

1. Filter **Missing settings** to find unpublished products.
2. Configure and review each product or use a controlled bulk update.
3. Filter by Rent, Lease, Lucky EMI, Direct Sale, or Featured to audit current
   publication setup.
4. Return to the brochure generator.
5. Generate and inspect the intended catalog before sharing it.

Settings management writes only `ProductBrochureSettings`. It does not create
brochures by itself and never creates invoices, receipts, payments,
subscriptions, EMIs, journals, reconciliation records, stock movements, or
reservations.

## API endpoints

Internal endpoints require an authenticated `ADMIN`, `CASHIER`, or `STAFF` role.

- `GET /api/v1/admin/brochures/product-settings/`
- `GET /api/v1/admin/brochures/product-settings/{product_id}/`
- `PATCH /api/v1/admin/brochures/product-settings/{product_id}/`
- `POST /api/v1/admin/brochures/product-settings/bulk-update/`
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
# BROCHURE-2 — Customer Enquiry Capture and CRM Lead Tracking

Public brochure links now support customer enquiry capture without creating an
order or financial transaction.

## Public enquiry flow

1. Customer opens `/brochures/{token}`.
2. The page loads the frozen, public-safe product snapshot from
   `GET /api/v1/public/brochures/{token}/products/`.
3. The customer may select one or more products and submit name, phone,
   location, preferred plan, message, and an optional expected delivery date.
4. `POST /api/v1/public/brochures/{token}/enquiries/` creates a
   `BrochureEnquiry` and frozen `BrochureEnquiryProduct` snapshots.
5. The customer receives an enquiry number in the
   `ENQ-BR-YYYYMMDD-XXXXXX` format.

Expired, non-generated, and invalid brochure links cannot accept enquiries.
Submitted products must exist in the brochure's frozen snapshot.

## Admin follow-up workflow

Admin, cashier, and staff users can use `/admin/brochures/enquiries` and the
matching `/api/v1/admin/brochures/enquiries/` endpoints to search, filter,
review, prioritize, assign, mark contacted, or close enquiries. Customer name
and phone are intentionally not editable through this workflow. Internal notes
and lifecycle status remain separate from the customer's original message.

Lifecycle:

`NEW → CONTACTED → QUOTED → CONVERTED / CLOSED / LOST`

Conversion remains manual and belongs to a future controlled workflow.

## CRM linkage

The CRM link service matches `PartyMaster` by phone before creating a new
party. Each enquiry gets its own `PartyLink`, `PartyInteraction`, and CRM
`Lead`. The brochure enquiry stores relational links to those records. If CRM
linkage fails, the brochure enquiry remains valid and an admin-visible warning
is stored for follow-up.

## Data safety and non-automation boundary

Product enquiry snapshots are allow-listed and exclude internal cost, vendor,
accounting, ledger, and finance fields. Public responses expose no enquiry or
CRM lists.

BROCHURE-2 does not create or modify:

- invoices, receipts, payments, subscriptions, or EMI schedules;
- journals, reconciliation records, or accounting bridge records;
- stock movements, reservations, delivery records, or rent/lease demands;
- quotations, direct sales, or automatic order conversion.

BROCHURE-3 may add an explicit, permission-controlled quote conversion path.
That future workflow must preserve the original enquiry and CRM audit trail.

# BROCHURE-2A — Enquiry Closeout and CRM Safety Hardening

BROCHURE-2A stabilizes enquiry follow-up before quotation conversion is added.

## Lifecycle and terminal states

Allowed transitions are:

- `NEW → CONTACTED / CLOSED / LOST`
- `CONTACTED → QUOTED / CLOSED / LOST`
- `QUOTED → CONVERTED / CLOSED / LOST`
- `CONVERTED`, `CLOSED`, and `LOST` are terminal.

`QUOTED` and `CONVERTED` are tracking labels only in this phase. They do not
create a quotation, customer, contract, order, subscription, invoice, payment,
delivery, or stock movement.

Every enquiry records an initial history row. Status, assignment, priority, and
follow-up changes create additional immutable history rows with the acting
internal user where available.

## Duplicate detection

Enquiries are softly flagged as possible duplicates when all of the following
match within 24 hours:

- normalized phone;
- the same brochure;
- at least one overlapping selected product;
- the earlier enquiry is still `NEW` or `CONTACTED`.

The submission is never blocked by duplicate detection. Admin users see the
original enquiry number and reason. Same-phone interest in a different product
is not automatically treated as a duplicate.

## Phone and CRM safety

The originally submitted phone remains on the enquiry. A separate
`phone_normalized` value removes formatting and consistently represents Indian
10-digit numbers with `+91`. Duplicate detection and CRM party matching use the
normalized value.

CRM linking is idempotent. Re-running it does not duplicate a party, lead, or
interaction. A possible duplicate may reuse the earlier active CRM lead, while
each enquiry keeps its own interaction. Link state is visible as
`NOT_ATTEMPTED`, `LINKED`, `PARTIAL`, `SKIPPED`, or `FAILED`; a CRM failure
never rolls back the public enquiry.

## Follow-up operations

Internal users can set `follow_up_at`, view `last_contacted_at`, edit
`internal_note`, filter overdue follow-ups and duplicates, and inspect status
history. Mark-contacted records the current timestamp and applies lifecycle
validation.

Public users cannot read or write assignment, internal notes, follow-up dates,
duplicate metadata, CRM identifiers/status, or enquiry history. Public product
snapshots remain allow-listed against internal cost, vendor, purchase,
accounting, ledger, and stock fields.

This phase remains enquiry and CRM lead tracking only. Quotation conversion is
reserved for a future BROCHURE-3 workflow.
# BROCHURE-3 — Quotation Drafts from Brochure Enquiries

BROCHURE-3 adds a non-financial quotation layer between public brochure enquiries/CRM leads and future business transactions:

`Public brochure → Enquiry → CRM party/lead/interaction → Quotation draft → PDF/public link → Customer review`

## Quotation workflow and statuses

- Admin staff can create a quotation manually or from a brochure enquiry.
- Creating from an enquiry copies customer display fields, brochure/enquiry references, safe product snapshots, requested quantities, preferred plans, and available CRM party/lead identifiers.
- Status transitions are restricted to:
  - `DRAFT → SENT` or `CANCELLED`
  - `SENT → ACCEPTED`, `REJECTED`, `EXPIRED`, or `CANCELLED`
- `ACCEPTED`, `REJECTED`, `EXPIRED`, and `CANCELLED` are terminal in this phase.
- `ACCEPTED` means agreement in principle only. It is not a booking or financial transaction.
- Enquiries are moved to `QUOTED` only when the existing enquiry lifecycle permits that transition. They are never marked `CONVERTED` automatically.

## Plan calculations

- Direct sale lines use quantity × unit price less line discount.
- Rent lines show recurring monthly amount and security deposit separately. Payable-now totals contain deposit, delivery charge, and any direct-sale component.
- Lease lines show monthly amount, tenure-based informational projection, and security deposit.
- Lucky EMI lines are informational only. The quote uses a safe available monthly value or derives an indicative amount and defaults to 15 months when no safe duration is available.
- Mixed quotations keep an explicit plan type on every line.
- All values are validated server-side. Negative amounts and discounts above gross quoted value are rejected.

## PDF and public sharing

- Quotation PDFs use existing Subidha branding and include customer display details, quotation number/date/validity, lines, deposits, discounts, delivery charge, payable-now amount, recurring monthly amount, projected total, terms, and public link.
- Public pages are accessed only by a secure URL-safe token.
- Public serializers exclude internal notes, CRM identifiers, staff assignment, cost/vendor/purchase/accounting/ledger/stock internals, and unrelated private customer data.
- Cancelled or explicitly expired quotations return a safe unavailable response. Sent quotations past their validity date are also unavailable.

## Explicit non-financial boundary

This phase creates only quotation records, status history, PDFs, share links, and best-effort CRM interaction notes. It does not create or modify invoices, receipts, payments, subscriptions, EMI schedules, rent/lease contracts, direct sales, deliveries, journal/reconciliation entries, stock ledgers, reservations, orders, or stock quantities.

Every public quotation and PDF includes this disclaimer:

> This quotation is not an invoice, receipt, contract, subscription, or stock reservation. Final billing, payment, stock availability, delivery, and contract creation require admin approval and separate confirmation.

## Admin workflow

- `/admin/brochures/quotations` provides search, status/type/date/enquiry filters, draft creation/editing, line editing, recalculation, PDF regeneration, lifecycle actions, public-link copy, and WhatsApp-message copy.
- Brochure enquiry detail exposes “Create quotation” and links to existing quotations.
- `/quotations/{token}` is the customer-safe review page. It has no payment or booking action.

## Future conversion path

A later separately approved phase may convert an accepted quotation into a rent contract, lease contract, direct sale, or Lucky EMI subscription. That future conversion must use the canonical domain services and independently enforce stock, contract, billing, payment, accounting, audit, and reconciliation rules.
