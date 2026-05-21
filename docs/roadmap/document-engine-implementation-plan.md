# Document / PDF Engine — Implementation Plan (Additive, Production)

Status: **PLAN ONLY (no implementation in this pass)**  
Primary objective: Ship an admin/cashier/customer-safe document experience without changing financial logic or existing write APIs.

## Phase 0 (Now): Audit findings (confirmed in repo)

Backend:
- Receipt PDF endpoints exist:
  - `/api/v1/admin/receipts/<id>/pdf/` (admin)
  - `/api/v1/customer/receipts/<id>/pdf/` (customer)
  - `backend/api/v1/views/phase4_finance.py`
- Invoice PDF exists: `/api/v1/admin/invoices/<id>/pdf/`
- Subscription documents exist (`SubscriptionDocument`) with regeneration endpoint:
  - `/api/v1/admin/documents/`
  - `/api/v1/admin/documents/<id>/regenerate/`
- PDF generation uses `reportlab` (already imported in services; tests exist for HR PDFs and receipt PDF).

Frontend:
- Customer payments page already links to receipt PDF:
  - `frontend/src/app/(dashboard)/customer/payments/page.tsx`
- Admin payment detail already includes a printable receipt layout component:
  - `frontend/src/app/(dashboard)/admin/payments/[id]/page.tsx` uses `PaymentReceiptDocument`

## Phase 1 (P0): Standardize “Download PDF” actions (no new models)

### Goal
Expose consistent PDF downloads in admin/cashier/customer surfaces using existing backend endpoints.

### Work items (frontend)
- Add “Download Receipt PDF” actions to:
  - admin payment detail (`frontend/src/app/(dashboard)/admin/payments/[id]/page.tsx`)
  - admin receipt registers (if not already)
- Prefer direct authenticated download via the existing endpoint:
  - `/api/v1/admin/receipts/<receiptId>/pdf/`

Notes:
- This is purely read-only access to an existing PDF endpoint.
- Do not introduce fake document IDs or placeholder receipts.

### Work items (backend)
- None expected if endpoints are already stable.
- Only add documentation on required permissions/ownership checks where needed.

## Phase 2 (P0/P1): Document Center UX unification (still no new models)

### Goal
Provide a single “Document Panel” on key detail pages that can list:
- SubscriptionDocument items (file-backed)
- ReceiptDocument PDF downloads (render-on-demand)
- Invoice PDF downloads

### Candidate attachment points (admin)
- Subscription detail pages (existing documents listing already implied by `/admin/documents/?subscription=<id>`)
- Payment detail page: show linked receipt(s) and download.
- Billing invoice detail page: show invoice PDF download.

### Candidate attachment points (cashier)
- Collection/payment detail surfaces (internal only).

### Required data
Use existing linkages:
- ReceiptDocument has FKs to `payment`, `subscription`, `billing_invoice`, `direct_sale`
- SubscriptionDocument links to `subscription`

## Phase 3 (P1): Operational “GeneratedDocument” contract (type-level + docs)

### Goal
Codify a stable internal contract to avoid drifting document logic across modules.

### Deliverables
- A documented “document registry contract”:
  - how to list documents for a subject (subscription/payment/sale)
  - how to render/download a document
  - how to regenerate a document (admin only)
- Frontend normalization layer (single mapping from backend doc shapes to UI cards)

No database migration required in this phase.

## Phase 4 (P2): Optional new `GeneratedDocument` table (only if justified)

### Preconditions (must be true before adding a model)
- We can prove that `SubscriptionDocument` + `ReceiptDocument` cannot support:
  - unified indexing and lifecycle tracking
  - versioning of non-subscription documents
  - consistent audit logs across doc families

### Model proposal
If needed, add `GeneratedDocument` as described in `docs/architecture/document-pdf-engine.md`.

### Migration rules
- Additive schema only.
- No backfill that mutates historical financial rows.
- Backfill can be best-effort indexing (copy stable references), but must be explicitly documented and reversible.

## Phase 5 (P2): Expand document types safely

Suggested additions, in safe order:
1) Payment receipt PDF (already exists; unify UI)
2) Direct sale invoice PDF (already exists; unify UI)
3) Subscription contracts (already exists; document center + regenerate)
4) Delivery handover note PDF (renderer exists in `document_pdf_service.py`; confirm endpoints/permissions before wiring)
5) Security deposit receipt PDF (document type exists; confirm generation flow before wiring)

## Risks (must be managed)
- Permissions: prevent admin-only document listing/regeneration from leaking to customer/partner.
- Determinism: PDFs must match persisted records; no “computed on the fly” business rules that could drift.
- Performance: avoid heavy multi-join listing endpoints without pagination.

## Deployment notes (when implemented)
- Ensure backend PDF dependencies (`reportlab`) are present in production requirements.
- Validate content-disposition filenames for safe attachment downloads.
- Add monitoring for PDF generation failures (HTTP 400/500 rates on pdf endpoints).

