# Modular Business Reset Governance

- Reset is admin-only and backend-service controlled.
- Frontend can only request: preview, backup job, reset execute, restore preview, restore execute.
- Typed phrase required: `RESET_SUBIDHA_CORE`.
- Preserved admin validation is mandatory.
- Full reset requires completed backup job reference.
- Scope preview returns model counts, warnings, blockers, and allowed state.
- Setup-only financial/inventory/product scopes are blocked when history exists.
