# Direct Sale Workflow

## Goal

Keep retail billing and later direct-sale collections inside one controlled workflow without mixing them into subscription EMI allocation, waiver, or reconciliation logic.

## Operational flow

1. Create or continue the direct-sale record from `Admin > Direct Sale Workflow > Direct Sale Register`.
2. Capture walk-in or registered customer context on the sale itself.
3. Confirm and invoice the sale through the existing billing flow.
4. Treat posted retail invoices with remaining balance as direct-sale receivables.
5. Collect later payments only through:
   - `Admin > Direct Sale Workflow > Collect Direct-Sale Balance`
   - `Cashier > Collection Workflows`
6. Issue retail receipts from the controlled receipt workflow tied to the posted receivable.

## Controls

- Direct-sale collections must remain invoice-backed.
- Retail receipts must remain finance-account linked.
- Direct-sale outstanding balance must stay separate from subscription ledger exposure.
- Later collections must update bill balance, receipt history, and finance-account visibility together.

## Customer profile visibility

The admin customer profile now shows:

- direct-sale history
- current direct-sale outstanding
- receipt history tied to direct sales
- direct-sale collection shortcuts when balance remains

## Daily-use notes

- Use direct sale for retail billing only.
- Do not use the subscription collection path for direct-sale recovery.
- Do not use direct-sale collection for EMI, rent, or lease contracts.
