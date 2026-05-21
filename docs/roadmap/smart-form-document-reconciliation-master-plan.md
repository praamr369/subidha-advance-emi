# Master Plan: Smart Form Lookups + Document Engine + Reconciliation Control Tower

Status: **AUDIT + PLAN ONLY (no code changes in this pass)**  
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

### C) Reconciliation Control Tower

Reference docs:
- `docs/architecture/reconciliation-control-tower.md`
- `docs/roadmap/reconciliation-implementation-plan.md`

Existing signals:
- `PaymentReconciliation` queue (admin-only)
- finance account settlement overview
- accounting bridge postings and journal entries

Deliverable (Phase 1):
- admin-only triage view aggregating deterministic exceptions + manual resolution notes/status
- no auto-correction

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
