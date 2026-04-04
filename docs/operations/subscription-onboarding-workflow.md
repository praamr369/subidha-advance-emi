# Subscription Onboarding Workflow

This workflow is the current safest and fastest supported path for first-live subscription onboarding in SUBIDHA CORE.

It is based on the code that exists today:

- one-by-one admin subscription creation is supported
- bulk subscription import is not confirmed and must not be assumed
- EMI pricing and Lucky ID allocation remain backend-controlled

## Current create surface

- Admin UI: `/admin/subscriptions/create`
- Backend create contract: `POST /api/v1/admin/subscriptions/`

The backend remains the source of truth for:

- contract total from product base price
- EMI amount from total and tenure
- EMI tenure validation against batch duration
- Lucky ID ownership and availability validation
- automatic Lucky ID assignment when EMI is created without a manual Lucky ID

## Fastest safe operator sequence

Use this order for high-volume first-live onboarding:

1. Search and select the customer.
2. Search and select the product.
3. Set the plan type.
4. For EMI, search and select the batch.
5. Review the Lucky ID preview.
6. Leave Lucky ID blank unless you need a specific manual number.
7. Confirm the derived preview.
8. Create the subscription.
9. Use `Create Another With Same Setup` for the next customer when product, plan, batch, partner, and start date should stay the same.

## Search behavior

The create page is now optimized for faster operator lookup:

- Customer search accepts name or phone and can be submitted with `Enter`.
- Product search accepts product name or product code and can be submitted with `Enter`.
- Partner search accepts username or phone and can be submitted with `Enter`.
- Batch search accepts batch code and can be submitted with `Enter`.
- Lucky ID search accepts a specific Lucky number and can be submitted with `Enter`.

## Product and plan guidance

When a product is selected, the page shows:

- product code
- base price
- enabled plan modes from the current product contract flags

Use that to confirm the operator is onboarding against the intended product before moving into batch selection.

## Batch and Lucky ID guidance

For EMI subscriptions:

- only `OPEN` batches should be used
- tenure is locked to the selected batch duration
- Lucky IDs are limited to the selected batch

When a batch is selected, the page now shows:

- batch code
- duration
- available slot count when present in the API payload
- Lucky ID availability preview for that batch

If a specific Lucky number is not required, leave Lucky ID blank. The backend will assign the next available Lucky ID safely during create.

Choose a manual Lucky ID only when:

- the customer already agreed on a specific number
- the operator has confirmed that number still appears in the available Lucky preview

## Reuse same setup

After a successful create, use `Create Another With Same Setup` when onboarding multiple customers into the same sales context.

This preserves:

- product
- plan type
- optional partner
- batch for EMI
- start date
- manual tenure for rent or lease

This clears:

- customer selection
- manual Lucky ID selection
- Lucky search query
- prior success message

For EMI, the Lucky preview is reloaded so the next contract starts from current availability instead of stale UI state.

## Validation and operator checks

Before submitting, confirm:

- customer identity is correct
- product is correct
- plan type is correct
- batch is selected for EMI
- Lucky ID is either intentionally selected or intentionally left blank
- start date is correct
- derived contract value and default EMI look correct

If the backend rejects the create, use the exact error returned by the page. Do not bypass the API with manual database edits.

## What this workflow does not do

This workflow does not add:

- bulk subscription import
- direct financial posting
- manual EMI schedule overrides
- Lucky draw processing
- payout, commission, or reconciliation shortcuts

Those behaviors remain in their existing controlled backend flows.
