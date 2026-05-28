# Phase 7A Route Inventory and Demo/Dead UI Cleanup

Branch: `update`

Status: **Phase 7A initial inventory and first safe cleanup patch**

Date: 2026-05-28

## Scope

Phase 7A is a read-side/frontend route cleanup pass after Product Recontract Phase 6H. It audits route inventory, navigation entries, role shells, route builders, document print routes, and suspect demo/dead UI. It must not change financial business logic, backend mutation behavior, evidence gates, payment posting, EMI generation, accounting posting, reconciliation, settlement, inventory, delivery, commission, payout, amendment, recontract, lucky draw, lucky ID, batch, rent/lease demand, or deposit records.

## Route inventory by role

This inventory uses the current App Router structure, route constants, route builders, and role navigation config as the authoritative Phase 7A source.

### Admin

Primary route families:

- `/admin` command center and operational dashboard routes.
- `/admin/operations/*` daily work and operations command center.
- `/admin/crm/*` customer, party, lead, KYC, follow-up, and service intake routes.
- `/admin/customers/*` customer register/detail/profile/statement routes.
- `/admin/subscriptions/*` Advance EMI, rent, lease, subscription creation, contract print, and workflow landing routes.
- `/admin/contract-amendments/*` amendment register/detail, product recontract workflow, report, and addendum print routes.
- `/admin/payments/*`, `/admin/collections`, `/admin/emis/*`, and `/admin/outstandings` collection and receivable routes.
- `/admin/billing/*` invoice, receipt, document register, direct-sale, and reversal routes.
- `/admin/deliveries/*`, `/admin/delivery/*`, and return-service routes.
- `/admin/accounting/*`, `/admin/finance/*`, `/admin/settlements/*`, and `/admin/reconciliation/*` accounting, books, bridge, journal, finance account, settlement, and reconciliation routes.
- `/admin/products/*`, `/admin/inventory/*`, `/admin/vendors/*`, and `/admin/purchases/*` inventory and procurement routes.
- `/admin/lucky-draws/*` and `/admin/lucky-ids/*` Lucky Plan operational routes.
- `/admin/hr/*` staff, attendance, leave, expense, salary, payroll, and staff document routes.
- `/admin/settings/*` business setup, print branding, policies, users, imports, and system readiness routes.
- `/admin/reports/*`, `/admin/reports-center/*`, `/admin/bi/*`, and `/admin/analytics/*` read-only reporting and BI routes.

Admin pages remain guarded through the admin layout and `AdminShellRouter`. Print document routes still bypass dashboard chrome while preserving admin role protection.

### Cashier

Primary route families:

- `/cashier` dashboard.
- `/cashier/collect` collection workspace.
- `/cashier/payments/*` cashier payment register/detail.
- `/cashier/billing/*` cashier billing/direct-sale support.
- `/cashier/day-close` cashier close workflow.
- `/cashier/notifications` operational notifications.

Cashier routes must not expose admin-only amendment, accounting setup, settlement import, or product recontract execution/report controls.

### Customer

Primary route families:

- `/customer` dashboard.
- `/customer/subscriptions/*` customer subscription views.
- `/customer/contract-amendments/*` customer amendment request/detail and product recontract consent/addendum view.
- `/customer/payments`, `/customer/emis`, `/customer/direct-sales`, `/customer/deliveries`, `/customer/support/*`, `/customer/profile`, and `/customer/notifications` self-service routes.

Customer pages must not expose admin product recontract report, execution, posting, reconciliation, rollback, reversal, or admin-only addendum links.

### Partner

Primary route families:

- `/partner` dashboard.
- `/partner/customers/*` partner-linked customer views.
- `/partner/subscription-requests/*` lead/request routes.
- `/partner/contract-amendments/*` partner amendment request/detail routes.
- `/partner/payments/*`, `/partner/collections`, `/partner/commissions`, `/partner/payouts`, `/partner/reports`, and `/partner/notifications` partner operations.

Partner pages must not expose admin-only product recontract report, accounting setup, settlement import, or execution controls.

### Vendor

Primary route families:

- `/vendor` dashboard.
- `/vendor/products`, `/vendor/orders`, `/vendor/quotes`, `/vendor/ledger`, `/vendor/outstanding`, `/vendor/purchase-returns`, `/vendor/documents`, `/vendor/profile`, and `/vendor/notifications` supplier-facing routes.

Vendor routes remain isolated from admin finance, settlement, recontract, customer, and cashier workflows.

### Public and auth

Primary route families:

- `/`, `/products`, `/lucky-plan`, `/rent`, `/lease`, `/direct-sale`, `/winners`, `/winner-history`, `/about`, `/contact`, and policy/legal routes.
- `/login`, `/logout`, `/register`, `/forgot-password`, and `/reset-password`.

Public/auth routes are outside dashboard role navigation and must not expose internal operations controls.

## Duplicate/stale route and navigation list

| Item | Classification | Decision | Notes |
|---|---|---|---|
| `Vendor Sourcing` and `Online Sourcing` both pointed to `ROUTES.admin.vendorsSourcing` | fix now | Removed duplicate `Online Sourcing` primary navigation entry | `Online Enquiries` remains as the online-intent route; underlying vendor sourcing route remains intact. |
| Admin route aliases for old lucky-draw, payments, finance reconciliation, and commission typo paths | keep temporarily for compatibility | Keep | They preserve older bookmarks and avoid breaking existing staff links. Do not delete until alias usage is measured. |
| `/admin/receipts/sample/*` document sample preview routes | defer | Keep route files for now; do not primary-link in production nav | These are sample/document preview surfaces. They are not in primary admin navigation. Phase 7B should decide whether to migrate into docs-only/dev-only or replace with real document register links. |
| `/admin/settings/local-sandbox` and local sandbox seed tooling | keep temporarily for compatibility | Keep route, do not add to primary nav | Useful for controlled local validation. Must not be presented as a production daily operation. |
| `Product & Inventory > Vendors` and `Vendors & Procurement > Vendors` | defer | Keep | One is inventory-context shortcut, one is procurement-context canonical route. Needs usage review before removal. |
| `Finance & Accounting > Reconciliation` and legacy reconciliation route constants | keep temporarily for compatibility | Keep | Canonical route remains `ROUTES.admin.financeCanonicalReconciliation`; compatibility aliases remain expected by route checks. |

## Dead/demo UI list

| Item | Classification | Decision | Notes |
|---|---|---|---|
| Receipt sample preview pages under `/admin/receipts/sample/*` | defer | Keep off primary navigation | They use static sample previews. Not removed in Phase 7A because print/document history may still rely on them for visual QA. |
| Local sandbox page | keep temporarily for compatibility | Keep off primary navigation | It is a controlled development/admin utility. Production deployment should not advertise it in daily navigation. |
| Placeholder text in generic form/search components | keep | Keep | Search placeholders are form guidance, not demo UI. |
| Legal policy template docs | keep | Keep | Documentation templates are not production UI. |

## Broken/missing endpoint list

No backend endpoint was changed in Phase 7A.

Initial static review did not identify a confirmed active production page calling a missing financial mutation endpoint. Suspect page/API checks that need deeper runtime verification in Phase 7B:

- Vendor sourcing and online enquiry flows.
- Legacy admin reconciliation aliases.
- Sample receipt preview pages.
- Local sandbox route visibility in production deployments.
- AI readiness/source routes if AI is disabled in production.

## Role/security risk list

| Risk | Classification | Decision | Notes |
|---|---|---|---|
| Admin product recontract report visible to customer/partner | keep | Existing guards/tests already deny access | Covered by Phase 6H frontend tests. |
| Print document routes contaminated by dashboard chrome | keep | Existing print route isolation remains | `AdminShellRouter` bypasses dashboard shell for print routes while keeping admin role guard. |
| Customer/partner navigation showing admin report link | keep | Current role navigation remains scoped | Admin navigation is generated separately from customer/partner groups. |
| Compatibility aliases exposing stale route names | keep temporarily for compatibility | Keep | Route aliases should redirect/demote stale paths without adding duplicate primary links. |

## Print route findings

Confirmed print/document route categories to preserve:

- Direct sale invoice print.
- Receipt print.
- Direct-sale delivery challan print.
- Lucky Plan / subscription contract print.
- Rent/lease contract print.
- Journal voucher print.
- Ledger/finance/customer statement print.
- Product recontract addendum print.

Phase 7A decision: keep all print routes. Print routes are evidence documents only. They must not calculate or mutate backend financial truth. Addendum print must remain available only after product recontract execution evidence exists.

## First cleanup patch implemented

### `frontend/src/config/admin-route-registry.ts`

Removed the duplicate `Online Sourcing` primary navigation entry because it pointed to the same route as `Vendor Sourcing`:

```text
ROUTES.admin.vendorsSourcing
```

`Online Enquiries` remains as the correct online-intent route for customer fulfilment sourcing workflows.

This is a navigation-only cleanup. It does not delete route files, backend endpoints, services, records, permissions, or compatibility aliases.

## Recommended cleanup decisions

| Area | Decision | Next action |
|---|---|---|
| Duplicate procurement nav | fix now | Done in Phase 7A initial patch. |
| Receipt sample routes | defer | Phase 7B should classify as dev-only, docs-only, or convert to real document QA route. |
| Local sandbox route | keep temporarily for compatibility | Phase 7B should add production visibility rules if needed. |
| Compatibility aliases | keep temporarily for compatibility | Measure usage before deleting. |
| Route inventory doc generated on 2026-05-11 | fix now/defer hybrid | Keep existing inventory, regenerate in Phase 7B if route count changed after recent phases. |
| AI readiness/source routes | defer | Confirm production feature flag state before demoting. |
| Vendor/accounting duplicate shortcut routes | defer | Review actual operator usage before demoting links. |

## Deferred items for 7B-7H

### Phase 7B — Generated route inventory refresh

Run:

```bash
cd frontend
npm run inventory:routes
npm run check:routes
```

Then update the generated route inventory and reconcile route counts after Phase 6H and Phase 7A.

### Phase 7C — Runtime endpoint audit

Use the route/service map to verify every active frontend route against backend API registration and role permissions. Do not invent endpoints.

### Phase 7D — Sample/dev-only route policy

Decide whether `/admin/receipts/sample/*` and `/admin/settings/local-sandbox` should remain accessible in production, be gated by environment/config, or move to documentation/dev-only flows.

### Phase 7E — Navigation demotion pass

Demote compatibility and secondary routes from primary navigation without deleting route files.

### Phase 7F — Print route QA pass

Run targeted print smoke tests and verify no dashboard chrome, command palette, operational buttons, or fake financial values appear in print media.

### Phase 7G — Role-shell smoke pass

Verify admin, cashier, customer, partner, vendor, public, and auth shells for wrong-role links and unauthorized access behavior.

### Phase 7H — Final production polish lock

Remove or document any remaining demo wording, placeholder operational buttons, and stale labels after 7B-7G evidence exists.

## Impact assessment

### Existing data

No existing business data changes. No migrations. No model or serializer changes.

### Financial integrity

No payment, EMI, subscription, accounting, reconciliation, settlement, inventory, delivery, commission, payout, amendment, recontract, lucky draw, lucky ID, batch, rent/lease demand, or deposit logic changed.

### Auditability

Improved by documenting route status, compatibility decisions, and cleanup classifications. No audit records are mutated.

### Daily shop usability

Improved by removing one duplicate procurement navigation entry and documenting which surfaces are operational, compatibility-only, or deferred.

### Future rent/lease compatibility

Preserved. Rent and lease routes remain in subscription workflows, print routes, deposit routes, delivery handoff, and return inspection navigation. No route family was removed.
