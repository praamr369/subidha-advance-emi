# Vendor Account Linking Rules

- Admin-only account-link workflow is available under `/api/v1/admin/vendors/{id}/account-link/`.
- Every link/change/unlink action requires a non-empty reason.
- Duplicate active vendor-user mappings are blocked.
- Link changes capture audit metadata: `old_user_id`, `new_user_id`, actor, and reason.
- Changing account link does not mutate historical purchase, ledger, stock, customer, partner, subscription, or commission records.
