# Admin V2 Migration Notes

This directory is the phase-0 documentation pack for the Admin V2 Vite migration.

Scope:

- document the target Admin V2 shape
- preserve the current Next.js admin as fallback until parity is proven
- keep backend business logic unchanged
- keep database schema unchanged
- keep money, stock, reconciliation, and audit truth on the backend

Current state:

- the repo already contains an `admin-vite/` workspace
- the existing Vite app is a real migration workspace, not a placeholder
- the current shell is still module-heavy and route-oriented
- the handover asks for a reduction to 8 large operational workbenches

Non-goals for this phase:

- no UI rewrite
- no backend change
- no schema change
- no route deletion
- no fake data

Reference files:

- [workbench-map.md](./workbench-map.md)
- [legacy-route-map.md](./legacy-route-map.md)
- [backend-api-map.md](./backend-api-map.md)
- [backend-gap-log.md](./backend-gap-log.md)
- [duplicate-route-removal-plan.md](./duplicate-route-removal-plan.md)
- [customer-360-spec.md](./customer-360-spec.md)
- [revenue-workbench-spec.md](./revenue-workbench-spec.md)
- [phase-roadmap.md](./phase-roadmap.md)

