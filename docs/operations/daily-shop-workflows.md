# Daily Shop Workflows

This is the current store-operations guide for daily use of SUBIDHA CORE.

For the canonical admin module layout and route grouping, also see:

- `docs/architecture/erp-transition-foundation.md`
- `docs/operations/admin-enterprise-workspace.md`
- `docs/operations/branch-governance.md`

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
3. Link each stock location to the correct branch when multi-branch visibility is enabled.
4. Use opening stock import for the initial on-hand baseline only; it posts explicit opening-balance movements into the stock ledger.
5. Use inventory item governance for default location, reorder level, stock item type, and delivery bridge participation.
6. Use stock adjustments for counted shortages or surpluses instead of editing product or subscription records.
7. Review `/admin/inventory/ledger` or `/admin/inventory/movements` when reconciling stock activity.

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
3. Collect payment through the cashier flow only. Branch and counter should come from the assigned cash desk when available.
4. Open the receipt immediately after payment and confirm the history row exists.
5. If a mistake occurred, escalate to admin reversal instead of re-entering or deleting records.

## 8A. Branch and counter opening control

Primary routes:

- Admin branches: `/admin/branches`
- Admin counters: `/admin/counters`
- Admin branch reporting: `/admin/branch-reporting`

Recommended order:

1. Confirm the primary branch exists before starting the day.
2. Confirm each live cashier desk is mapped to the correct counter and finance account.
3. Confirm stock locations used that day are linked to the correct branch.
4. Review branch reporting when reconciling branch-wise collections, stock posture, and people costs.

## 9. Purchase and stock inward

Primary routes:

- Admin vendor register: `/admin/accounting/vendors`
- Admin purchase bills: `/admin/accounting/purchase-bills`
- Admin purchase book: `/admin/accounting/books/purchase`

Recommended order:

1. Create or confirm the vendor first.
2. Confirm the procured product already has an inventory profile.
3. Mark raw-material capable inventory items through inventory governance when applicable.
4. Create the purchase bill in `DRAFT` and review line-level quantities, rates, and tax.
5. Approve the purchase bill when it is operationally frozen.
6. Post the purchase bill only when stock should be received and accounting should recognize the purchase.
7. Review the inventory ledger and purchase book after posting.
8. When using multiple warehouses or branches, confirm the linked stock location and finance account imply the intended branch ownership.

## 10. Manufacturing and production control

Primary routes:

- Admin manufacturing overview: `/admin/manufacturing`
- Admin BOM register: `/admin/manufacturing/boms`
- Admin production jobs: `/admin/manufacturing/jobs`
- Admin production job detail: `/admin/manufacturing/jobs/{id}`

Recommended order:

1. Confirm the finished good and all raw-material items already have inventory profiles.
2. Prepare or update the active BOM revision for the finished good.
3. Create the production job in `DRAFT`.
4. Release the job only when material planning and location selection are correct.
5. Post the raw-material issue batch from the job detail instead of adjusting stock manually.
6. Use material return correction when unused raw material comes back from the production floor.
7. Post finished-goods receipt and any scrap explicitly from the output action.
8. Complete the job only after WIP cost is cleared and no draft posting lines remain.

## 11. Expense voucher operations

Primary routes:

- Admin expenses: `/admin/accounting/expenses`
- Admin journals: `/admin/accounting/journals`

Recommended order:

1. Use the expense workflow for non-stock operating costs.
2. Select the vendor only when the expense came from an outside supplier or service provider.
3. Save draft, approve, and post through the controlled expense flow.
4. Review the resulting journals and books instead of creating manual journals first.

## 12. Staff and salary operations

Primary routes:

- Admin staff register: `/admin/accounting/staff`
- Admin attendance: `/admin/accounting/attendance`
- Admin leave register: `/admin/accounting/leave`
- Admin salary register: `/admin/accounting/salary`
- Admin salary detail: `/admin/accounting/salary/{id}`
- Admin expense claims: `/admin/accounting/expense-claims`
- Admin staff ledger: `/admin/accounting/staff-ledger`

Recommended order:

1. Create or update the staff profile first.
2. Maintain recurring salary components, standard daily hours, and overtime posture from the staff register.
3. Record daily attendance and overtime from the attendance workspace.
4. Create and approve leave requests from the leave register instead of editing attendance or salary rows by hand.
5. Create the salary sheet for the period, preferably through auto-generation.
6. Review the salary detail page to confirm line breakdown, deductions, and outstanding amount.
7. Approve and post the salary sheet to accrue payroll.
8. Record salary payments only after the salary sheet is posted.
9. Use staff expense claims for employee reimbursement, not vendor expenses.
10. Review the staff ledger for employee-level payable or receivable posture.
11. Close the payroll period only after draft and approved salary sheets are resolved.

## 13. Partner-originated collections

Primary routes:

- Partner collections: `/partner/collections`
- Admin collection requests: `/admin/partners/collection-requests`

Recommended order:

1. Partner submits collection requests from the partner-scoped workflow.
2. Admin reviews each request against the subscription and EMI context.
3. Admin approves or rejects inside the admin workflow.
4. Treat partner collection requests as pending operational input until approved.

## 14. CRM lead and party continuity

Primary routes:

- Admin CRM overview: `/admin/crm`
- Admin CRM leads: `/admin/crm/leads`
- Admin CRM parties: `/admin/crm/parties`
- Admin lead detail: `/admin/leads/{id}`

Recommended order:

1. Start from the CRM overview to review due follow-ups and recent party activity.
2. Open the CRM lead register or lead detail to assess the enquiry and current owner.
3. Create the real customer, direct sale, or subscription from the bounded operational workflow only.
4. Complete lead conversion explicitly so the lead links to the real live record.
5. Use the party timeline to review subscriptions, direct sales, invoices, receipts, deliveries, support history, and reminders together.
6. Record follow-up notes or handoff interactions from the party timeline instead of overwriting financial or contract records.

## 15. Lucky draw operations

Primary routes:

- Admin lucky draws: `/admin/lucky-draws`
- Admin lucky draw history: `/admin/lucky-draw/history`

Recommended order:

1. Confirm the batch is eligible for draw operations.
2. Run reveal and winner operations only through the admin lucky draw workflow.
3. Validate winner visibility and post-draw subscription state after reveal.
4. Do not attempt to assign or remove winner state through generic subscription edit paths.

## 16. Returns, complaints, and after-sales service

Primary routes:

- Admin service desk overview: `/admin/service-desk`
- Admin complaint register: `/admin/service-desk/complaints`
- Admin return register: `/admin/service-desk/returns`
- Admin service tickets: `/admin/service-desk/tickets`
- Admin case detail: `/admin/service-desk/cases/{id}`

Recommended order:

1. Start from complaint intake when the customer reported an issue through support.
2. Create or open the bounded service-desk case instead of editing delivery, stock, invoice, or journal rows by hand.
3. Use `AUTHORIZED` before posting return or service finance effects.
4. For direct-sale returns, post the credit note from the case detail and let the note post stock inward when required.
5. For EMI delivery returns, request and complete the delivery return from the case detail so the existing delivery bridge handles stock inward.
6. For exchanges, keep the original return and the replacement direct sale separate, then link the replacement sale back onto the case.
7. For after-sales service charges, post a debit note from the case only when the service should affect billing.
8. Resolve and close the case explicitly when the work is complete.

## 17. End of day

1. Review cashier payment activity and receipt history.
2. Review the billing document register for direct retail invoices, receipts, and note adjustments.
3. Review purchase bills, expense vouchers, salary sheets, and salary payments posted that day.
4. Review manufacturing jobs that still carry WIP cost or deferred costing/accounting posture.
5. Review the CRM follow-up queue and unresolved party interactions.
6. Run `/admin/accounting/bridges` for the approved bridge lanes that apply that day:
   - payment collection and payment reversal
   - EMI payment receipts
   - retail sale posting
   - inventory posting
   - EMI waiver
   - commission settlement
   - payout batch posting
7. Review trial balance, cash book, bank book, UPI book, purchase book, and billing/accounting registers for anomalies.
8. Review pending partner collection requests and unresolved support issues.
9. If there was any reversal, waiver, salary mismatch, purchase correction, production mismatch, CRM handoff miss, or operational mismatch, record the incident and leave an auditable trail through admin workflows.
