# Admin Dashboard Data Representation

## Representation Principles
- Show operational truth using active-vs-history separation.
- Prefer dense strips, queue rows, and ledger summaries over repeated KPI cards.
- Never fabricate numbers, placeholders, or synthetic finance summaries.

## Recommended Primitives
- `MetricStrip`: compact business-health top line.
- `QueueList`: action-first operational queue rows.
- `LedgerSummary`: finance/accounting style net rows.

## Card Usage Policy
- Cards are allowed for isolated status blocks.
- Avoid repeating multiple near-identical KPI cards for the same surface.
- Favor row-based and strip-based layout when operators need scan speed.

## Finance Labeling
- Use labels such as `Active Invoice Balance`, `Active Outstanding`, `Window Collections`, `History only`.
- Avoid ambiguous `Total` labels unless active/history scope is explicit.
