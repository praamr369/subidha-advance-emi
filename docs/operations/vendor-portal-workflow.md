# Vendor Portal Workflow

- Vendor users authenticate with role `VENDOR` and are mapped through `Vendor.linked_user`.
- Vendor portal routes under `/vendor/*` provide dashboard, profile, ledger, outstanding, purchase orders, and purchase returns.
- Vendor users cannot access admin vendor APIs or unrelated customer/partner financial workflows.
- Vendor ledger and outstanding APIs are read-only and scoped to the linked vendor only.
