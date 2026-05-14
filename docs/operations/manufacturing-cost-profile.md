# Manufacturing Cost Profile

## Scope
- Inventory profile exposes manufacturing cost metadata.
- BOM-backed cost preview is read from existing manufacturing BOM/lines where available.

## Cost fields
- raw material cost
- labour cost
- overhead cost
- total estimated manufacturing cost
- finished goods output quantity

## Guardrails
- Cost profile update does not consume materials.
- Cost profile update does not create finished goods stock.
- Actual production issue/receipt stays in production job workflows.
