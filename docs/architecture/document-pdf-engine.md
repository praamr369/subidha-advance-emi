# Document / PDF Engine (Architecture + Audit Notes)

Status: **AUDIT COMPLETE (docs-only)**  
Design intent: **Unify** existing document behaviors into a consistent, auditable “Document Engine” without breaking current flows.

## 1) What Exists Today (Confirmed)

### Backend PDF generation uses `reportlab`

Existing PDF renderers:
- Staff PDFs: `backend/accounting/services/staff_pdf_service.py`
- Subscription / contract / operational docs: `backend/subscriptions/services/contract_pdf_service.py`
- Billing/finance PDFs (invoice/receipt/handover): `backend/subscriptions/services/document_pdf_service.py`

These services generate bytes and are already exercised by API views and tests.

### Existing persisted “document” storage models

1) `SubscriptionDocument` (file-backed, versioned, auditable)
- Model: `backend/subscriptions/models.py` (`SubscriptionDocument`)
- Types enum: `SubscriptionDocumentType` includes:
  - `ADVANCE_EMI_CONTRACT_PDF`, `RENT_CONTRACT_PDF`, `LEASE_CONTRACT_PDF`
  - `PAYMENT_RECEIPT_PDF`, `SECURITY_DEPOSIT_RECEIPT_PDF`
  - `DIRECT_SALE_INVOICE_PDF`, plus operational notes (handover/inspection/amendment)

2) `ReceiptDocument` (financial document record, links to payment/journal entry)
- Model: `backend/billing/models.py` (`ReceiptDocument`)
- Key linkage fields:
  - `payment` (OneToOne), `subscription` (FK), `direct_sale` / `billing_invoice` (FKs)
  - `posted_journal_entry` (OneToOne)
  - `receipt_no`, `receipt_type`, `source_type`, `source_reference`

### Existing API endpoints (admin/customer) for PDFs and document center

Receipt PDF:
- Admin: `GET /api/v1/admin/receipts/<id>/pdf/`
- Customer: `GET /api/v1/customer/receipts/<id>/pdf/`
Implemented in: `backend/api/v1/views/phase4_finance.py` (`AdminReceiptPdfView`, `CustomerReceiptPdfView`)

Invoice PDF:
- Admin: `GET /api/v1/admin/invoices/<id>/pdf/` (via `AdminInvoicePdfView`)

Document Center + regeneration (admin):
- `GET /api/v1/admin/documents/` (subscription-filtered listing)
- `POST /api/v1/admin/documents/<id>/regenerate/`
Implemented in: `backend/api/v1/views/phase4_finance.py` (`AdminDocumentCenterView`, `AdminDocumentRegenerateView`)

### Frontend document-related UI (confirmed)

- Printable receipt layout component: `frontend/src/components/receipts/PaymentReceiptDocument.tsx`
- Customer receipt download link (PDF endpoint): `frontend/src/app/(dashboard)/customer/payments/page.tsx`

## 2) Problem Statement

Even though PDFs and “document storage” already exist, the system lacks a single, explicit “document engine contract”:

- different modules generate docs differently (subscription docs vs receipts vs staff PDFs)
- there is no single place to answer: “What documents exist for this payment/subscription/sale, who generated them, and how do I re-generate?”
- some documents are **file-backed** (`SubscriptionDocument`), while receipts are **record-backed** (`ReceiptDocument`) and rendered on demand

The goal is to unify behaviors while preserving:
- financial source-of-truth
- existing API endpoints and response shapes
- existing historical document files and audit logs

## 3) Proposed “GeneratedDocument” Design (Additive Concept)

This repo already has `SubscriptionDocument` and `ReceiptDocument`. The recommended approach is:

### Option A (Preferred): “GeneratedDocument” as a unifying concept without a new table

Define a stable internal contract (docs + type layer) that treats:
- `SubscriptionDocument` as a stored generated document
- `ReceiptDocument` as a source document that can render a PDF deterministically

Then build a single “Document Panel / Document Center” UX that can list both kinds.

### Option B (Only if needed later): Add a new `GeneratedDocument` table (additive)

If operational needs require cross-module indexing and lifecycle tracking beyond `SubscriptionDocument` + `ReceiptDocument`, introduce a new app (e.g. `documents`) with:

**`GeneratedDocument` (proposed fields)**
- `id`
- `doc_type` (enum; stable, system-wide)
- `status` (`DRAFT` | `GENERATED` | `FAILED` | `VOIDED`) — document lifecycle only (not financial)
- `version` (int; supports regeneration/versioning)
- `audience` (`ADMIN` | `CASHIER` | `CUSTOMER` | `PARTNER`) — controls availability, not permissions
- `content_type` + `object_id` (generic link to source record such as `ReceiptDocument`, `Subscription`, `BillingInvoice`)
- `source_reference` (string: receipt_no / contract_reference / invoice_no, etc.)
- `file` (optional FileField for pre-rendered PDFs)
- `render_strategy` (`ON_DEMAND` | `PERSISTED`) to preserve the existing patterns
- `checksum_sha256` (optional; dedupe + audit)
- `generated_by`, `generated_at`
- `regenerated_from` (nullable FK to prior GeneratedDocument row)
- `generation_reason` / `notes`

**Important constraints**
- This model must **not** become a financial source-of-truth.
- It must never auto-correct receipts/payments/subscriptions; it only records document generation events and artifacts.
- It must remain compatible with existing document APIs (no breaking changes).

## 4) PDF Service Plan (How to Generate Safely)

### Core rules
- PDFs must be **deterministic** from persisted source records (receipt/invoice/subscription).
- Generation must be **idempotent** when requested repeatedly.
- When persisted, each generation must create an auditable record (versioning + actor + timestamp).
- No PDF generation path should mutate financial history.

### Recommended service boundaries

1) Renderers (pure-ish functions returning bytes)
- Keep as existing pattern:
  - `render_receipt_pdf(receipt)`
  - `render_invoice_pdf(invoice)`
  - `generate_advance_emi_contract_pdf(subscription, performed_by=...)` (persists)

2) Document registry service (one place to list available docs)
- “What documents exist and how do I fetch them?”
- For receipts: show “download PDF” link (rendered on demand)
- For subscription docs: show file URLs + regenerate actions (admin only)

## 5) Permission Model (Non-negotiable)

- Admin-only:
  - document center listing across all subscriptions
  - document regeneration
  - staff PDFs (HR)
- Cashier:
  - receipt PDFs relevant to cashier operations (if already permitted by existing backend patterns)
- Customer:
  - receipt PDFs limited to customer-owned receipts (existing `CustomerReceiptPdfView` already enforces ownership)
- Partner:
  - no admin document center access; partner documents must be explicitly scoped

## 6) First “Safe” Document Type

**Money receipt PDF** is the safest first document type for the engine, because:
- it is already supported end-to-end in backend (`AdminReceiptPdfView`, `CustomerReceiptPdfView`)
- it is derived from `ReceiptDocument` (already journal-linked and immutable-by-status)
- it can be attached to Payment Detail UIs as a read-only download action without altering posting logic

## 7) Known Gaps / Follow-ups

- A unified admin UI “Document Panel” should present:
  - subscription documents (`SubscriptionDocument`)
  - receipt PDFs (`ReceiptDocument` → pdf endpoint)
  - invoice PDFs (`BillingInvoice` → pdf endpoint)
- If a future `GeneratedDocument` table is introduced, migration must be additive and must not rewrite historical docs.

---

## Phase C (Implemented): Document Engine Foundation (Backend + Frontend primitives)

Implementation date: **2026-05-21**

### Decision: `GeneratedDocument` table **deferred**

Rationale:
- Existing persisted models already cover the two current document families safely:
  - **file-backed + versioned**: `SubscriptionDocument`
  - **financial record-backed + deterministic render**: `ReceiptDocument` (PDF rendered on-demand)
- Adding a new table in Phase C would duplicate indexing without improving auditability for the first target doc type (money receipt PDF).

### Backend foundation added

New internal service contract (no API changes in Phase C):
- `backend/subscriptions/services/document_engine_service.py`
  - stable `DocumentMeta` contract for stored docs and on-demand PDFs
  - checksum helpers (`sha256`) for file-backed docs
  - source link resolver for known-safe models (Phase C scope)
  - permission helpers (admin + customer ownership only; no new cashier/partner exposure)

### Frontend foundation added

Reusable document UI primitives (not yet wired broadly):
- `frontend/src/components/documents/DocumentPanel.tsx`
- `frontend/src/components/documents/DocumentActionBar.tsx`
- `frontend/src/components/documents/DocumentStatusBadge.tsx`
- `frontend/src/components/documents/DownloadPdfButton.tsx`

### Document metadata contract (Phase C)

Canonical fields (service-layer; used for future listing/normalization):
- `document_type`
- `document_number` (adapter: receipt_no / contract_reference / subscription_number)
- `source_model` + `source_object_id`
- `customer_id` (nullable)
- `branch_id` (nullable)
- `status` (doc-family specific; e.g. receipt status vs verification status)
- `generated_by_user_id` (nullable; best-effort for receipts)
- `generated_at` (source record timestamp; receipts are on-demand render)
- `checksum_sha256` (nullable; computed for file-backed docs)
- `metadata` (JSON)

### PDF library decision

Phase C remains unified on existing **reportlab** renderers:
- `backend/subscriptions/services/document_pdf_service.py`

---

## Phase D (Implemented): Money Receipt PDF UI Wiring (Admin-safe only)

Implementation date: **2026-05-21**

Scope delivered:
- Wired the existing Money Receipt PDF capability into a permission-safe admin surface using the shared `DocumentPanel` components.
- No changes to payment posting, accounting posting, receipt source records, EMI logic, or reconciliation behavior.
- No new “GeneratedDocument” table and no new document-generation endpoints.

Confirmed wiring:
- Page: `frontend/src/app/(dashboard)/admin/payments/[id]/page.tsx`
  - Lists the payment-linked `ReceiptDocument` (if present) via the existing admin billing receipt register API (`/api/v1/billing/receipts/?payment=<payment_id>`).
  - Downloads the PDF via the existing admin receipt PDF endpoint (`/api/v1/admin/receipts/<receipt_id>/pdf/`).

Permission posture:
- Admin-only access preserved (page is admin route; backend endpoints are already admin-scoped).
- No cross-role expansion in Phase D (cashier/customer/partner wiring intentionally deferred unless role-safe endpoints are explicitly verified per surface).

Reconciliation compatibility:
- DocumentPanel preserves source identity by displaying:
  - payment id (route context)
  - receipt id + receipt number (from `ReceiptDocument`)
  - receipt status + receipt date
  - endpoint is deterministic render from persisted `ReceiptDocument` rows
