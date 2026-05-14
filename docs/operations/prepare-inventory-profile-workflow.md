# Prepare Inventory Profile Workflow

1. Open admin product detail.
2. Click `Prepare Inventory Profile`.
3. System creates or reuses `InventoryItem` linked one-to-one with product.
4. System assigns inventory ID and SKU seed from product code/SKU.
5. System marks profile prepared without creating stock.
6. Operator opens profile and proceeds with opening stock if needed.

## Operator notes
- If product is inactive, preparation is blocked.
- If already prepared, open profile instead of creating duplicate.
