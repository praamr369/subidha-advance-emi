# Direct-Sale Customer Workflow

## Goal

Run direct-sale customer entry in one controlled operator flow without mixing direct-sale posting into subscription EMI rails.

## Entry points

1. Existing customer: search and select from `Admin > Billing > Direct Sales`.
2. New customer: use `Create new customer` from the direct-sale customer desk.
3. Walk-in lead: register lead/quotation/estimate first, then continue direct sale with linked handoff.

## Step-by-step operations

1. Open `Admin > Billing > Direct Sales`.
2. In `Customer and Lead Entry`:
   - search existing customer by name/phone/username
   - select customer and open profile if verification is needed
3. If customer does not exist:
   - open `Create new customer`
   - complete normal customer onboarding (profile + login)
   - return and select created customer
4. Capture sale details in `Create Direct Sale`:
   - sale date, branch, counter, finance account, line items
   - customer snapshots (auto-filled from selected customer when available)
5. Create direct sale.
6. If lead handoff is active, the system links conversion to that lead explicitly.
7. Continue standard billing actions:
   - confirm direct sale
   - delivery confirmation where required
   - invoice posting through billing workflows

## Control points

- Direct sale and subscription sale remain separate business rails.
- Direct-sale creation remains source-record first; posting stays in billing controls.
- Customer snapshots are explicit and preserved on direct-sale documents.
- Lead conversion linking is explicit; no silent conversion state mutation.

## Collection alignment

- Unpaid/partial direct-sale balances remain collectible from existing direct-sale collection rails.
- Use direct-sale collection workflow only for invoiced retail receivables.
- Do not collect subscription EMI from direct-sale collection workflow.
