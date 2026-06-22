# Admin V2 Duplicate Route Removal Plan

Goal:

- remove route noise only after the V2 workbenches are functionally ready
- keep the old Next.js admin until parity is proven
- prevent the V2 app from reintroducing 67 module-level sidebar entries

## Removal rule

Do not delete a route until:

- the V2 route or workbench exists
- the workflow is smoke-tested
- the route is no longer required for fallback
- the owner agrees the legacy path can be retired or aliased

## What should be removed from V2 first

- standalone create pages
- standalone edit pages
- action-specific history pages
- duplicate route families that are now drawer or tab states
- redundant landing pages for the same business object

## Replace with

- workbench tabs
- entity drawers
- query-param deep links
- command bar actions
- selected-row state

## Legacy families that must not be recreated in V2

- `legacy-dashboard`
- `erp`
- `workspace`
- `delivery`
- `service`
- `partner`
- `lucky-draw`
- `emi`
- `emi-overdue`
- `reports`
- `commisions`

## Cleanup sequence

1. finish the V2 workbench
2. validate build and typecheck
3. verify key smoke paths
4. compare route intent with the legacy admin
5. remove duplicate V2-only pages
6. leave legacy Next.js fallback in place until parity is accepted

