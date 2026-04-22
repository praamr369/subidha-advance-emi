# Subscription Sale Workflow

## Goal

Preserve the existing EMI-safe subscription workflow while keeping the navigation and customer profile clearly separate from direct-sale operations.

## Operational flow

1. Open `Admin > Subscription Sale Workflow > Create Subscription Sale`.
2. Create the customer if required.
3. Create the subscription contract with existing Lucky Plan rules.
4. Use the existing EMI schedule, payment posting, waiver, draw, commission, and payout logic unchanged.
5. Collect subscription payments only through:
   - `Admin > Subscription Sale Workflow > Collect Subscription Payment`
   - `Admin > Collections & Cash Desk > Collections Workspace`
   - `Cashier > Collection Workflows`

## Controls

- Subscription collections remain EMI-row based.
- Waived EMI states remain distinct from paid EMI states.
- Lucky draw logic continues to affect future EMI waiver only.
- Direct-sale receivables do not enter subscription ledger posting paths.

## Customer profile visibility

The unified admin customer profile keeps subscription-side operations visible through:

- contract history
- latest payment history
- ledger-backed subscription collection summary
- partner linkage
- receipts and subscription documents

## Future compatibility

The workflow remains structurally compatible with `RENT` and `LEASE` because the navigation and collection separation is now business-first rather than EMI-only.
