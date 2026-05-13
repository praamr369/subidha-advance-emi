# Purchase + Vendor Flow (Phase 4)

## Scope
- Vendor profile is owned in accounting vendor master and reused by inventory procurement documents.
- Procurement documents are additive and auditable: Purchase Request -> Purchase Order -> Goods Receipt -> Vendor Bill -> Vendor Payment.
- Vendor Return is handled as explicit purchase return workflow with stock and accounting impact.

## Rules
- PO lines require real inventory items and active vendors.
- GRN posting writes stock IN movements through stock ledger service.
- GRN over-receive is blocked unless `allow_over_receive=true` with explicit reason.
- Vendor bill posting creates accounting bridge journal and vendor-ledger payable increase entry.
- Vendor payment posting creates accounting bridge journal and vendor-ledger payable reduction entry.
- Vendor payment cannot exceed linked vendor bill total.
- Purchase return posting writes stock OUT movement and creates payable reduction entry.
- No procurement step mutates EMI, lucky draw, commission, payout, or direct-sale semantics.
