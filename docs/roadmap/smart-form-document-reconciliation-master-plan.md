# Master Plan: Smart Form Lookups + Document Engine + Reconciliation Control Tower

Status: **PHASE I RECONCILIATION IMPLEMENTED (2026-05-21)**  
Principles: financial correctness, auditability, backward compatibility, and operational usability.

## Executive Summary

Three additive production systems are planned to reduce operational error, improve audit readiness, and centralize exception handling **without** changing EMI logic, payment posting, lucky draw, waiver, commission, payout, ledger, or reconciliation source-of-truth behavior.

1) **Smart Form & Lookup UX System**  
Replace raw ID entry with role-safe, real lookup/search selectors.

2) **Document / PDF Engine**  
Unify existing PDF generation and document listing into consistent “document center + panel” behavior.

3) **System-wide Reconciliation Control Tower**  
Create an admin-only triage layer aggregating exceptions from existing reconciliation and accounting bridge evidence. Phase 1 is read-only detection + manual resolution notes/status only.

## Dependencies (confirmed)

- Lookup UX depends on stable read-only search endpoints.
- Document engine depends on existing PDF generation services (`reportlab`) and existing document models.
- Control tower depends on deterministic source links already present:
  - `ReceiptDocument` links to payment/journal entry
  - `AccountingBridgePosting` links source → journal entry
  - inventory ledger `reference_model/reference_id` traces

Settlement lookup hardening (implemented 2026-05-22):
- Dedicated admin-only, read-only, bounded lookup endpoints were added for settlement allocation forms:
  - `GET /api/v1/admin/settlements/lookups/finance-accounts/?q=...&kind=BANK|UPI`
  - `GET /api/v1/admin/settlements/lookups/payments/?q=...`
  - `GET /api/v1/admin/settlements/lookups/receipts/?q=...`
  - `GET /api/v1/admin/settlements/lookups/money-movements/?q=...`
- These endpoints are lookup-only hardening: no auto-match, no suggestions, no write behavior, and no source-record mutation.

## Workstreams

### A) Smart Form & Lookup UX System

Reference doc: `docs/roadmap/smart-form-lookup-system.md`

P0 targets (confirmed raw-ID inputs):
- Manufacturing BOMs + jobs:
  - `frontend/src/app/(dashboard)/admin/manufacturing/boms/page.tsx`
  - `frontend/src/app/(dashboard)/admin/manufacturing/jobs/page.tsx`
  - `frontend/src/app/(dashboard)/admin/manufacturing/jobs/[id]/page.tsx`
- Service desk tickets + returns:
  - `frontend/src/app/(dashboard)/admin/service-desk/tickets/page.tsx`
  - `frontend/src/app/(dashboard)/admin/service-desk/returns/page.tsx`

Existing building blocks:
- UI: `frontend/src/components/ui/SearchSelect.tsx`
- Backend inventory lookup: `/api/v1/admin/inventory/items/search/?q=...`

Phase B (implemented on 2026-05-21):
- Added reusable smart-form primitives: `frontend/src/components/erp/forms/*`
- Replaced raw-ID inputs in manufacturing create flows:
  - `frontend/src/app/(dashboard)/admin/manufacturing/boms/page.tsx`
  - `frontend/src/app/(dashboard)/admin/manufacturing/jobs/page.tsx`
- Reused existing read-only lookup/search endpoints; no backend write contract changes

Deliverable:
- no raw IDs for high-consequence references; show “lite” entity labels + deep links.

### B) Document / PDF Engine

Reference docs:
- `docs/architecture/document-pdf-engine.md`
- `docs/roadmap/document-engine-implementation-plan.md`

Existing backend capabilities:
- receipt PDF endpoints (admin + customer)
- invoice PDF endpoint (admin)
- subscription document center + regeneration

Deliverable:
- consistent “Download PDF” actions across payment/receipt/invoice/subscription pages
- unified document panel listing stored docs + on-demand PDFs

Phase C (implemented 2026-05-21):
- Added backend + frontend foundation only (no broad wiring yet).
- Deferred a new `GeneratedDocument` table in favor of a unifying service-layer contract.

Phase D (implemented 2026-05-21):
- Wired Money Receipt PDF into the safest existing admin surface using `DocumentPanel`:
  - `frontend/src/app/(dashboard)/admin/payments/[id]/page.tsx`
- Reused existing read-only receipt register lookup + existing admin receipt PDF endpoint.
- Did not expand cashier/customer/partner document wiring in this pass; role-safe endpoints must be confirmed per surface before enabling.

### C) Reconciliation Control Tower

Reference docs:
- `docs/architecture/reconciliation-control-tower.md`
- `docs/architecture/reconciliation-source-link-map.md` (Phase E: deterministic source-link audit)
- `docs/roadmap/reconciliation-implementation-plan.md`

Existing signals:
- `PaymentReconciliation` queue (admin-only)
- finance account settlement overview
- accounting bridge postings and journal entries

Deliverable (Phase 1):
- admin-only triage view aggregating deterministic exceptions + manual resolution notes/status
- no auto-correction

Phase E (implemented 2026-05-21):
- Completed the deterministic source-link audit required to prevent noisy reconciliation exceptions.

Pre-settlement prerequisite (docs-only, implemented 2026-05-22):
- Cash / Bank / UPI settlement source-link audit:
  - `docs/architecture/cash-bank-upi-settlement-source-link-map.md`

Next prerequisite for true settlement matching (design-only):
- External settlement evidence ingestion + explicit allocation links:
  - `docs/architecture/bank-upi-cashier-settlement-design.md`
  - `docs/roadmap/settlement-import-day-close-roadmap.md`
This remains internal-role-only (admin/cashier) and stays read-only against existing financial source records.

Settlement (Cash/Bank/UPI) (implemented 2026-05-22):
- Implemented only deterministic `READY_FOR_SETTLEMENT_PHASE` checks (no auto-correction; no source-record mutation).
- Focused on explicit evidence links:
  - Payment ↔ bridge posting ↔ JournalEntry source-link integrity
  - ReceiptDocument ↔ posted JournalEntry amount integrity (deterministic-only)
  - MoneyMovement ↔ posted JournalEntry integrity and explicit journal_group balance flags
- Explicitly deferred: settlement batches, external bank statement matching, cashier day-close mismatch, and any business-rule-dependent invariants (method↔kind, receipt required, etc.).
- Noted current validity gap: payment invalidation is authoritative only via `OperationalCancellation` for EMI reversals, and receipt invalidation lacks a similarly explicit deterministic source-link contract. Receipt bridge evidence is therefore limited today because `ReceiptDocument.posted_journal_entry` can remain present after a receipt has been voided.

Settlement allocation-backed checks (implemented 2026-05-22):
- Implemented deterministic Control Tower checks backed only by explicit `SettlementAllocation` evidence (module=`settlement`).
- Guarantees: no auto-match, no suggested matching, no allocation creation/voiding, and no source-record mutation.

Phase F (implemented 2026-05-21):
- Added stored Control Tower runs/items/evidence/resolutions (admin-only).
- Implemented only deterministic `READY_FOR_PHASE_F` checks (no auto-correction).
- Added admin UI for runs, module matrix, exception queue, and item drilldown + resolution notes.

Phase G (implemented 2026-05-21):
- Extended Control Tower checks to deterministic direct-sale / billing / receipt reconciliation using explicit source links only.
- No auto-correction; no mutation of billing/receipt/journal source records.

Phase H (implemented 2026-05-21):
- Extended Control Tower checks to deterministic direct-sale return/refund reconciliation using explicit source links only.
- Added journal source-link integrity checks for BillingCreditNote and CustomerRefund and duplicate-posting detection for each (CRITICAL).
- No auto-correction; no mutation of return/refund/credit-note/journal source records.

Phase I (implemented 2026-05-21):
- Added deterministic inventory / stock / manufacturing Control Tower checks using a strict `StockLedger.reference_model/reference_id` allowlist.
- No auto-correction; no mutation of `StockLedger` or inventory/manufacturing source records.

Inventory Source-Link Hardening (preparation, implemented 2026-05-21):
- Standardized and documented deterministic `StockLedger` source-link contracts for remaining stock workflows (purchase/GRN, delivery, exchange, opening stock, adjustments).
- Added helper constants/functions and unit tests proving existing `reference_model/reference_id` outputs.
- Expanded the Phase I StockLedger reference allowlist **only** where reference formats are proven by code/tests.
- No new reconciliation checks added in this phase (preparation only).

Phase J (implemented 2026-05-22):
- Extended Control Tower detection to deterministic purchase/GRN + delivery bridge + exchange replacement + stock adjustment stock-evidence checks using only allowlisted StockLedger reference contracts.
- No auto-correction; no mutation of StockLedger or source records.

Phase K (implemented 2026-05-22):
- Extended Control Tower detection to deterministic vendor payable / purchase accounting evidence checks using explicit posted_journal_entry links and JournalEntry source-link integrity.
- No auto-correction; no mutation of PurchaseBill/VendorBill/VendorPayment/PurchaseReturn/JournalEntry source records.

Phase L0 (implemented 2026-05-22):
- Added additive settlement evidence + allocation schema foundation (Bank Statement Import, UPI Settlement Import, Cashier Day Close, Settlement Allocation).
- Schema only: no parser/import workflows, no matching UI, no auto-matching, no new Control Tower checks.
- No mutation/backfill of `Payment`, `ReceiptDocument`, `MoneyMovement`, journals, finance accounts, cash counters, or historical financial records.

Phase L1 (implemented 2026-05-22):
- Added admin-only upload + checksum + CSV parsing for bank statements and UPI settlements into line tables.
- Implemented admin-only settlement import UI (evidence ingestion only):
  - `/admin/settlements/bank-imports` and `/admin/settlements/upi-imports` support upload + list + detail views.
- Still evidence ingestion only:
  - no auto-match, no suggested matching
  - no allocations created automatically
  - no reconciliation items created/closed
  - no source-record mutation of `Payment`, `ReceiptDocument`, `MoneyMovement`, journals, finance accounts, or cash counters

Phase L2 (implemented 2026-05-22):
- Added admin-only manual `SettlementAllocation` workflow (no auto-match, no suggestions).
- Guarantees:
  - no reconciliation checks are created/closed
  - no mutation of `Payment`, `ReceiptDocument`, `MoneyMovement`, journals, finance accounts, cash counters, or source evidence rows (beyond line matched_status)
 - Frontend wiring:
   - `/admin/settlements/bank-imports/{id}` and `/admin/settlements/upi-imports/{id}` include manual allocation forms and line-scoped allocation viewing/voiding.
 - Lookup UX hardening (frontend-only, read-only; stores numeric IDs only):
   - Finance account selector reuses `GET /api/v1/accounting/finance-accounts/?search=...&kind=BANK|UPI`
   - Allocation target selectors reuse:
     - `GET /api/v1/admin/payments/?q=...` (admin-only payment list)
     - `GET /api/v1/billing/receipts/?search=...` (admin-only receipt register)
     - `GET /api/v1/accounting/money-movements/?search=...` (admin-only accounting movements)

## Deployment Plan (when implemented)

### Order of rollout (recommended)
1) Smart Form lookups for manufacturing + service desk (reduces new errors)
2) Document engine UI unification for receipts/invoices/contracts (improves filing + support workflows)
3) Control tower aggregation view (reduces exception triage time)

### Rollback posture
- All changes are additive; rollback should primarily remove UI wiring or disable routes.
- Avoid irreversible data migrations until the system proves stable under shop operations.

## Risks (cross-cutting)

- Role leakage: admin-only lookups/documents/reconciliation must never be exposed to customer/partner roles.
- Data shape drift: centralize normalization in services; do not scatter assumptions in pages.
- Performance: ensure lookup endpoints are indexed and rate-limited via query constraints (limit/pagination).
- Trust: fix the `/admin/manufacturing/boms` “Customer Workspace” label mismatch if confirmed to be a session-sync issue.

## Next Implementation Phase Checklist

- Confirm base DRF search behavior for viewsets that declare `search_fields` (so frontend can rely on `?search=` consistently).
- Decide for Control Tower Phase 1:
  - computed-only endpoints vs persisted `ReconciliationRun/Item`
- Pick the first UI insertion points:
  - Manufacturing forms
  - Service desk ticket/return references
  - Admin payment detail “Download Receipt PDF”
