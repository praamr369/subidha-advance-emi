# Vendor/Manufacturer Future Marketplace Compatibility

## Current shape
- Vendor remains a dedicated master model; it is not merged with partner/customer.
- Manufacturing module remains independent from procurement posting semantics.
- Procurement documents carry source references and can be extended for manufacturer channel later.

## Additive extension path
- Introduce shared Party/Profile abstraction as additive mapping layer (no model merge).
- Map manufacturer entities to vendor-compatible procurement interfaces.
- Keep document lineage explicit so manufacturer-to-customer workflows can reuse PO/GRN/bill lifecycle safely.
