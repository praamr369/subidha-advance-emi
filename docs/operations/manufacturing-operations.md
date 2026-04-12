# Manufacturing Operations

This guide defines the additive manufacturing-lite workflow now available in SUBIDHA CORE.

It is based on the live code paths in:

- `manufacturing.models`
- `manufacturing.services.production_service`
- `inventory.services.stock_service`
- `accounting.services.bridge_posting_service`

## Boundaries

- Manufacturing is a separate operational module. It does not replace billing, accounting, inventory, delivery, or subscription truth.
- Product and inventory master remain canonical for finished goods, raw materials, accessories, SKU, and unit references.
- Raw-material issue, return correction, finished-goods receipt, and scrap posting must happen through explicit production-job actions.
- Accounting mirrors eligible manufacturing cost movements through traced bridge entries only. It is not the production-control surface.

## Core admin routes

- `/admin/manufacturing`
- `/admin/manufacturing/boms`
- `/admin/manufacturing/jobs`
- `/admin/manufacturing/jobs/{id}`

## BOM governance

Use BOMs to define approved raw-material and accessory consumption for one finished-good inventory item.

Supported BOM controls:

- finished-good inventory profile linkage
- revision number
- active or inactive state
- default BOM flag per finished good
- quantity per unit
- wastage percent
- notes per line

Guardrails:

- BOM lines must use raw-material or accessory inventory items.
- The finished good itself cannot appear as a BOM consumption line.
- Active BOMs are not free-edited; create or maintain drafts, then activate explicitly.
- Only one active default BOM is allowed per finished-good inventory item.

## Production job workflow

1. Maintain the raw-material and finished-good inventory profiles first.
2. Prepare and activate the BOM revision when the job should follow standard consumption.
3. Create the production job in `DRAFT`.
4. Confirm planned output quantity, stock location, and BOM linkage.
5. Release the job only when production is operationally ready.
6. Post material issue batches explicitly from the job detail.
7. Use material return correction when issued quantity must come back from production into raw stock.
8. Post finished-goods receipt and any scrap from the output action.
9. Complete the job only after output is posted and WIP is cleared.

Guardrails:

- Jobs start from `DRAFT` and move through `RELEASED`, `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`.
- Posted jobs are not corrected by editing historical stock or journal rows.
- Cancellation is allowed only before production posting has started.

## Material issue and finished-goods receipt

Material issue behavior:

- `ISSUE` lines reduce raw-material or accessory stock through explicit stock-ledger posting.
- `RETURN` lines act as controlled material correction and return raw stock into inventory.
- BOM-seeded material lines may be posted as a batch once the job is released.

Finished-goods receipt behavior:

- receipt lines increase the finished-good inventory profile only through the job output action
- receipt can be partial when operators need staged completion
- scrap lines remain explicit and reduce the WIP pool for the job

Stock movement trace:

- `PRODUCTION_ISSUE_OUT`
- `PRODUCTION_RETURN_IN`
- `PRODUCTION_RECEIPT_IN`

## WIP, scrap, and costing posture

The production job caches:

- total issued cost
- total received cost
- total scrap cost
- remaining WIP cost
- costing status
- accounting status

Rules:

- WIP is the operational balance between issued cost, received finished-good cost, and scrap cost.
- Scrap stays explicit as job-level wastage, not as a hidden stock adjustment.
- When costing data is incomplete, manufacturing may still post operational stock safely while accounting stays deferred.
- This pass does not introduce a full standard-costing, variance, or MRP engine.

## Accounting bridge posture

Manufacturing may create source-traced accounting bridge rows for:

- raw-material issue into WIP
- raw-material return from WIP
- finished-goods receipt from WIP
- scrap expense recognition

Guardrails:

- no cash, bank, or UPI activity is posted from manufacturing
- no manual journal should be used to simulate material issue or FG receipt
- accounting entries must stay traceable to the production job and production line that created them

## End-of-day review

1. Review released or in-progress production jobs.
2. Confirm raw-material issues and return corrections in the stock ledger.
3. Confirm finished-goods receipt rows in the stock ledger.
4. Review jobs still carrying WIP cost.
5. Review deferred costing or accounting jobs before finance close.
