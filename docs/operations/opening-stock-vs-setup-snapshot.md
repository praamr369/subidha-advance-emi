# Opening Stock vs Setup Snapshot

## Setup Snapshot
- Setup snapshot stores setup masters only (branch/counter, warehouse/location, finance/setup references).
- Setup snapshot excludes transactional stock rows and opening stock postings.

## Opening Stock
- Opening stock is the first real quantity posting.
- Opening stock generates auditable stock records.
- Opening stock must be posted in inventory workflows, never stored as setup snapshot quantity.
