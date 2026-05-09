# Direct Sale Billing Gap Analysis

## Scope Reviewed
- Backend: direct sale models/services, billing serializers/views/routes, cashier/admin routes, inventory models/services, purchase need workflow.
- Frontend: admin direct-sale page, cashier collect panel, dashboard widgets, inventory purchase-needs page, billing services.

## Current Gaps (Before This Upgrade)
- Product selection was constrained to limited lists and did not expose full catalog search behavior suitable for fast counter billing.
- Out-of-stock handling lacked an explicit billing-workspace feedback loop with requirement creation visibility.
- Cashier/admin flows were split between collection/search surfaces and not optimized for a unified Zoho/Odoo-style billing workspace.
- Inventory requirement tracking existed (`PurchaseNeed`) but was not tightly connected to direct-sale line shortages with source tagging.
- Dashboard and purchase-needs workflows surfaced inventory pressure but not direct-sale-specific demand context consistently.

## Safety Constraints Applied
- Existing EMI/subscription/payment/reconciliation posting paths remain source of truth and were not replaced.
- Direct-sale create/update continues through existing billing services.
- Inventory and product domains remain separate; integration is read-only for search and additive for requirement alerts.
- No destructive edits to existing billing/accounting data structures.

## Additive Upgrade Plan Implemented
- Add read-only billing product search APIs for admin and cashier with stock-state payload.
- Add read-only direct-sale preview APIs (admin/cashier) for totals and stock warnings without persistence.
- Extend `PurchaseNeed` metadata for source-module/source-object/customer/priority tracking.
- Auto-create/update direct-sale purchase needs from existing direct-sale service when shortages are detected.
- Add dedicated billing workspace routes for admin and cashier with faster product search and preview-first UX.
