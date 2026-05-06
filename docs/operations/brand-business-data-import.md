# Brand & Business Data Import Center

## Purpose
`/admin/brand-data` is the admin-only workflow for importing official brand/business profile data into public-facing profile fields through a safe preview-review-apply pipeline.

## Safety Rules
- Import is additive and review-gated.
- External content is never auto-applied.
- Admin must explicitly approve imported item IDs before apply.
- No customer, subscription, EMI, payment, ledger, commission, payout, lucky draw, or accounting records are mutated.
- Public reviews/social snippets are not written into customer master records.
- Financial records are never import targets.

## Manual Import Flow
1. Open **Brand & Business Data Center**.
2. Paste structured JSON with supported fields.
3. Click **Create Import Preview**.
4. Approve/reject candidate items in approval queue.
5. Click **Apply Approved Items**.
6. Verify updates in public pages/footer/contact/about.
7. Review audit feed for traceability.

## Supported Fields
- `business_name`
- `brand_name`
- `tagline`
- `description`
- `phone`
- `whatsapp`
- `email`
- `address`
- `city`
- `state`
- `pincode`
- `service_areas`
- `opening_hours`
- `google_maps_url`
- `website_url`
- `facebook_url`
- `youtube_url`
- `instagram_url`
- `justdial_url`
- `logo_url`
- `storefront_image_urls`
- `selected_review_quotes`

## Audit Events
- `BRAND_IMPORT_PREVIEW_CREATED`
- `IMPORTED_ITEM_APPROVED`
- `IMPORTED_ITEM_REJECTED`
- `BRAND_PROFILE_APPLIED`
- `PUBLIC_CONTENT_BLOCK_UPDATED`
