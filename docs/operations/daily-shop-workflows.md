# Daily Shop Workflows

This is the current store-operations guide for daily use of SUBIDHA CORE.

For the canonical admin module layout and route grouping, also see:

- `docs/architecture/erp-transition-foundation.md`
- `docs/operations/admin-enterprise-workspace.md`

## 1. Start of day

1. Confirm backend readiness and frontend login page are reachable.
2. Confirm admin, cashier, and partner logins are working.
3. Review admin dashboard and reconciliation attention before posting new business.
4. Confirm the selling batch is in `OPEN` status and has available lucky IDs.

## 2. Customer onboarding

Primary routes:

- Admin customer register: `/admin/customers`
- Admin customer create: `/admin/customers/create`

Recommended order:

1. Search first to avoid duplicate customer creation by phone.
2. If the customer is new, create the customer profile with name, phone, username, password, and KYC starting state.
3. If bulk customer preload is needed, use the customer CSV preview first and then import.
4. If imported customers need portal login, immediately plan a password reset or manual credential handoff because CSV import does not return generated passwords.

## 3. Product onboarding

Primary routes:

- Admin products register: `/admin/products`
- Admin product create: `/admin/products/create`
- Admin product import: `/admin/products/import`

Recommended order:

1. Create or import product master data before opening sales for a batch.
2. After product CSV import, review the product record to confirm `is_active`, `is_emi_enabled`, `is_rent_enabled`, and `is_lease_enabled`.
3. Treat imported descriptions and categories as metadata only; base price remains financially significant.

## 4. Inventory foundation and stock control

Primary routes:

- Admin inventory hub: `/admin/inventory`
- Admin stock locations: `/admin/inventory/locations`
- Admin inventory items: `/admin/inventory/items`
- Admin opening stock import: `/admin/inventory/opening-stock`
- Admin stock adjustments: `/admin/inventory/adjustments`

Recommended order:

1. Prepare the inventory profile from the product detail only for stock-tracked products.
2. Maintain stock locations before posting opening balances or counted adjustments.
3. Use opening stock import for the initial on-hand baseline only; it posts explicit opening-balance movements into the stock ledger.
4. Use inventory item governance for default location, reorder level, stock item type, and delivery bridge participation.
5. Use stock adjustments for counted shortages or surpluses instead of editing product or subscription records.
6. Review `/admin/inventory/ledger` or `/admin/inventory/movements` when reconciling stock activity.

## 5. Batch preparation

Primary routes:

- Admin batches register: `/admin/batches`
- Admin batch create: `/admin/batches/create`
- Lucky ID operations: `/admin/lucky-ids`

Recommended order:

1. Create the batch with the intended duration, draw day, and start date.
2. Confirm total slots and selling status are correct before opening the batch.
3. Confirm lucky IDs exist and are available for sale.
4. Start selling only from batches that are operationally ready and `OPEN`.

## 6. Subscription sale

Primary routes:

- Admin subscription register: `/admin/subscriptions`
- Admin subscription create: `/admin/subscriptions/create`

Recommended order:

1. Select the existing customer.
2. Select the intended product.
3. For EMI onboarding, select the correct batch.
4. Use a lucky ID from that same batch or allow the backend to auto-assign the next available lucky ID.
5. Confirm tenure matches batch duration for EMI before submission.
6. After create, verify the subscription detail page and EMI schedule before collecting any money.

## 7. Direct retail sale and billing

Primary routes:

- Admin billing overview: `/admin/billing`
- Admin direct sales: `/admin/billing/direct-sales`
- Admin billing document register: `/admin/billing/register`

Recommended order:

1. Use direct sales only for non-EMI furniture sales; do not create a Lucky Plan subscription for walk-in retail billing.
2. Select the canonical product and, when stock-tracked, the linked inventory profile.
3. Capture the customer or walk-in snapshot and decide whether delivery must happen before the final invoice is posted.
4. Confirm the direct sale, then review the linked billing invoice draft from the billing detail screen.
5. If delivery is required, mark the direct sale delivered before posting the final retail invoice.
6. Let invoice posting issue stock and generate the receipt trail explicitly; do not edit stock or receipt state by hand.

## 8. Cashier payment collection

Primary routes:

- Cashier dashboard: `/cashier`
- Cashier collect workspace: `/cashier/collect`
- Cashier payment history: `/cashier/payments`

Recommended order:

1. Search collectible EMIs by phone or subscription.
2. Confirm the right EMI row, amount, and customer before posting.
3. Collect payment through the cashier flow only.
4. Open the receipt immediately after payment and confirm the history row exists.
5. If a mistake occurred, escalate to admin reversal instead of re-entering or deleting records.

## 9. Partner-originated collections

Primary routes:

- Partner collections: `/partner/collections`
- Admin collection requests: `/admin/partners/collection-requests`

Recommended order:

1. Partner submits collection requests from the partner-scoped workflow.
2. Admin reviews each request against the subscription and EMI context.
3. Admin approves or rejects inside the admin workflow.
4. Treat partner collection requests as pending operational input until approved.

## 10. Lucky draw operations

Primary routes:

- Admin lucky draws: `/admin/lucky-draws`
- Admin lucky draw history: `/admin/lucky-draw/history`

Recommended order:

1. Confirm the batch is eligible for draw operations.
2. Run reveal and winner operations only through the admin lucky draw workflow.
3. Validate winner visibility and post-draw subscription state after reveal.
4. Do not attempt to assign or remove winner state through generic subscription edit paths.

## 11. End of day

1. Review cashier payment activity and receipt history.
2. Review the billing document register for direct retail invoices, receipts, and note adjustments.
3. Run `/admin/accounting/bridges` for the approved bridge lanes that apply that day:
   - payment collection and payment reversal
   - EMI payment receipts
   - retail sale posting
   - inventory posting
   - EMI waiver
   - commission settlement
   - payout batch posting
4. Review trial balance, cash book, bank book, UPI book, and billing/accounting registers for anomalies.
5. Review pending partner collection requests and unresolved support issues.
6. If there was any reversal, waiver, or operational mismatch, record the incident and leave an auditable trail through admin workflows.
