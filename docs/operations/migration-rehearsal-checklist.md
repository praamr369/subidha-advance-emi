# Data Migration Rehearsal Checklist

Use this checklist in staging or a rehearsal clone before the production cutover.

## 1. Rehearsal inputs

- Fresh copy of candidate CSVs kept outside git
- Signed source extracts from the business team
- Approved branch/counter mapping sheet
- Approved customer onboarding and subscription onboarding plan

## 2. Rehearsal sequence

1. Apply migrations.
2. Load branch masters and counters.
3. Load products.
4. Load vendors and staff.
5. Load opening stock.
6. Load customers.
7. Create batches and validate lucky IDs.
8. Create subscriptions manually or through approved controlled scripts only.

## 3. What to compare after rehearsal

- Branch count
- Counter count
- Product count and sample SKU/UOM correctness
- Vendor count
- Staff count
- Stock-on-hand sample totals
- Customer count
- Batch count and lucky ID count per batch
- Subscription count and EMI schedule count

## 4. Rehearsal stop conditions

- Any import preview shows invalid rows
- Counter cannot resolve to a branch-safe finance account
- Batch validation fails
- Subscription totals or monthly EMI values do not match product/base-price rules
- Branch reporting does not match the expected collection or stock context

## 5. Rehearsal output pack

- Command log
- Import result summaries
- Count comparison sheet
- Issues found and resolution notes
- Final approved production cutover sequence
