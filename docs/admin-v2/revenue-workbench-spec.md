# Revenue Workbench Spec

Revenue Workbench groups the high-frequency money-adjacent admin tasks into one desktop-style surface.

## Purpose

Keep sales, contracts, collections, receipts, and related review tasks in one place while preserving backend authority.

## Required tabs

- Sales Desk
- Direct Sale
- Lucky Plan
- Subscriptions
- Rent / Lease
- EMIs
- Payments
- Receipts
- Billing
- Outstanding
- Settlements
- Counters
- Customer Advances

## Business rules

### Direct Sale

- walk-in customer is allowed if backend supports it
- no mandatory KYC
- no mandatory full customer registration
- product selection, price, discount, invoice, and receipt remain backend-owned
- delivery is optional and must follow backend workflow

### Lucky Plan / Advance EMI

- customer is required
- KYC state must be visible
- batch is required
- lucky ID is required
- subscription is required
- EMI schedule is backend-generated
- payment collection is backend-authorized
- draw and waiver visibility must come from backend evidence

### Rent / Lease

- customer is required
- KYC is required
- deposit is required
- contract is required
- possession / handover state must be backend-authored
- demand and return flows must stay separate from EMI logic

## Safety rules

- no frontend payment posting
- no frontend waiver creation
- no frontend receipt generation
- no frontend accounting math
- no frontend outstanding balance math
- no frontend stock movement logic

## Recommended interactions

- search and filter the current workbench tab
- open selected row in a drawer
- show backend preview before dangerous actions
- require confirmation before posting or reversal actions
- show success references returned by backend

## Acceptance note

The workbench is complete when an admin can:

- create a direct sale preview
- view subscription state
- collect a payment
- view the receipt
- inspect outstanding
- stay within one workbench

