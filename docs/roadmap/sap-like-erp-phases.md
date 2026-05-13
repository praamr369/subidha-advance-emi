# SAP-like ERP Phases (Additive, Non-Breaking)

## Phase 1: Finance + Accounting Control (current phase)
- Harden canonical setup checks and setup-status contract.
- Keep all posting/reconciliation controls service-driven and auditable.
- No migration unless additive and required.

## Phase 2: Sales document flow (Direct Sale + EMI Contract)
- Tighten contract/invoice/receipt linkage validation.
- Ensure deterministic document numbering and posting traceability.

## Phase 3: Inventory / MM stock ledger
- Strengthen stock movement to accounting bridge parity and exception handling.

## Phase 4: Purchase + vendor/manufacturer
- Normalize procurement lifecycle with payable and settlement traceability.

## Phase 5: Delivery + return + cancellation control
- Enforce explicit reversal/refund pathways with immutable history.

## Phase 6: CRM + service desk
- Strengthen lead-to-customer and complaint-to-resolution audit chains.

## Phase 7: HR + staff accountability
- Harden attendance/expense/payroll approval and posting controls.

## Phase 8: CMS + public content control
- Keep public content workflows isolated from finance truth.

## Phase 9: Automation + BI
- Add controlled automations and report lineage from persisted records only.

## Phase 10: Rent/lease expansion
- Add rent/lease-specific contracts, billing cadence, and accounting mappings as additive extensions.
