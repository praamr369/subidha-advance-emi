# SUBIDHA CORE Project Rulebook

## 1. Purpose of this rulebook

This is the canonical engineering and business workflow rulebook for **SUBIDHA CORE – Lucky Plan EMI System**. A developer must read this file before changing backend logic, frontend pages, API contracts, financial workflows, schemas, tests, deployment configuration, or operational documents.

This file separates:

- **Confirmed from code**: rules, models, services, routes, scripts, and UI structure found in the repository.
- **Project rule / instruction**: owner-approved operating rule that must guide future implementation even if part of the code is incomplete.
- **Needs confirmation**: business or technical rule that requires owner/code confirmation before implementation.

## 2. System identity

**SUBIDHA CORE – Lucky Plan EMI System** is the operational system for Subidha Furniture. It is not a demo app. It handles real shop operations involving money, customer contracts, Lucky IDs, batches, EMI schedules, payments, waivers, accounting, finance accounts, direct sales, inventory, delivery, reconciliation, and role-based dashboards.

The system must remain suitable for today’s Lucky Plan EMI business and future expansion into rent, lease, manufacturing, service desk, reminders, CRM, HR/staff, and vendor/customer fulfillment.

## 3. Approved stack

### Backend

- Django
- Django REST Framework
- PostgreSQL
- JWT authentication
- Canonical API mount: `/api/v1/` via `backend/core/urls.py` and `backend/api/v1/urls.py`

### Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui / Radix primitives
- Role-based dashboards and route guards

### Stack rules

- Do not restart the architecture.
- Do not propose random stack changes.
- Do not introduce microservices unless explicitly approved.
- Keep `/api/v1` stable.
- Add features through existing apps, services, serializers, and route modules.

## 4. Non-negotiable project rules

| Rule | Status | Practical meaning |
|---|---:|---|
| Additive changes by default | Project rule | Prefer nullable fields, new services, new endpoints, or compatible serializer fields. |
| Backward compatibility | Project rule | Existing data, EMI schedules, Lucky IDs, payments, waivers, commissions, payouts, reconciliation, and audit logs must remain valid. |
| No silent mutation of money history | Project rule | Use reversals, lifecycle events, audit logs, and linked records instead of editing history. |
| No fake operational UI | Project rule | No dead buttons, mocked KPIs, fabricated rows, or placeholder staff workflows in production paths. |
| No invented endpoints | Project rule | Frontend must call only implemented backend routes. |
| No frontend business authority | Project rule | Frontend may display derived values, but backend services own financial truth. |
| No financial shortcuts | Project rule | Do not bypass accounting, reconciliation, audit, commission, payout, inventory, or receipt safety. |
| No destructive schema changes without explicit approval | Project rule | Do not drop fields/tables or rewrite enums without migration/backfill/approval. |
| Preserve Lucky Plan EMI behavior | Project rule | Product base price, batch/lucky ID assignment, deterministic EMI schedule, payment collection, and future EMI waiver behavior must remain stable. |

## 5. Core business invariants

| Invariant | Source |
|---|---|
| Product `base_price` is the contract `total_amount` for EMI creation. | Confirmed from `subscriptions.services.subscription_service.create_emi_subscription`. |
| Default EMI is `total_amount / tenure_months`, rounded to 2 decimals, with rounding difference handled during schedule generation. | Confirmed from `create_emi_subscription`. |
| One customer can have multiple subscriptions. | Confirmed from `Customer` to `Subscription` FK. |
| One subscription is financially independent. | Confirmed by `Payment`, `Emi`, `CustomerAdvanceAllocation`, ledgers, and reconciliation links to one subscription. |
| One customer can hold multiple Lucky IDs through multiple EMI subscriptions. | Confirmed by `Subscription.lucky_id` unique per EMI subscription, not unique per customer. |
| EMI subscriptions require batch and Lucky ID unless cancelled. | Confirmed from `Subscription.clean()`. |
| Lucky numbers are 00–99. | Confirmed from `LuckyId` and `SubscriptionRequest` constraints. |
| Open batch must have exactly 100 slots. | Confirmed from `Batch.clean()`. |
| Lucky draw winner gets future EMI waiver only. | Project rule / instruction; verify exact waiver cutoff when changing draw service. |
| Paid EMIs are not automatically refunded by winner benefit. | Project rule / instruction. |
| Waived EMI is not paid EMI. | Confirmed by `EmiStatus.PAID` and `EmiStatus.WAIVED`, and payment service blocks collection against waived EMI. |
| Payment, EMI, waiver, commission, payout, reconciliation, accounting, and audit records must remain traceable. | Confirmed by model/service structure and project rule. |
| Admin and cashier are internal roles. | Project rule / instruction. |
| Customer and partner public registration must follow approved workflow. | Project rule / instruction. |

## 6. Domain model map

| Domain | Model name | File | Purpose | Money impact | Audit impact | Frontend surfaces | Future rent/lease relevance |
|---|---|---|---|---|---|---|---|
| Customer | `Customer` | `backend/subscriptions/models.py` | Customer profile linked to auth user, KYC, contact, source. | Links all contracts/payments. | Customer source and KYC metadata. | Admin/customer/cashier/partner customer surfaces. | Common party record for rent/lease. |
| Product | `Product`, `ProductCategoryMaster`, `ProductSubcategoryMaster`, `ProductUnitOfMeasureMaster` | `backend/subscriptions/models.py` | Product catalog, price, SKU/UOM, mode eligibility. | `base_price` feeds contract amount. | Product snapshots stored on contracts. | Admin products, subscription create, direct sale. | Mode flags include EMI/RENT/LEASE/direct sale. |
| Batch | `Batch` | `backend/subscriptions/models.py` | Lucky Plan batch with slots, duration, draw day, lifecycle. | Controls EMI tenure and draw readiness. | Batch transitions must be traceable. | Admin batches/lucky draw. | EMI-specific; rent/lease must not force batch. |
| Lucky ID | `LuckyId` | `backend/subscriptions/models.py` | Number 00–99 within batch. | Controls subscription eligibility and winner benefit. | Status changes must not orphan prior contracts. | Admin subscription create, batch detail, customer contract. | EMI-specific. |
| Subscription / contract | `Subscription`, `ContractReference`, `ContractReferenceSequence` | `backend/subscriptions/models.py` | Contract core for EMI, RENT, LEASE; immutable reference support. | Total amount, monthly amount, waived amount. | Product/pricing snapshots, terms lock, cancellation metadata. | Admin/customer/partner subscription pages and contract print. | Central extension point. |
| EMI | `Emi` | `backend/subscriptions/models.py` | Monthly installment schedule. | Receivable, paid/waived/cancelled status. | Ledger and audit linked through payment/waiver services. | Cashier collect, admin EMI reports, customer payments. | Rent/lease demands must not be treated as EMI unless explicitly designed. |
| Payment | `Payment` | `backend/subscriptions/models.py` | EMI payment record with finance account, branch, counter, reference. | Real money received. | Audit log, business event, ledger, reconciliation, finance posting. | Admin/cashier/partner/customer payment surfaces. | Rent/lease collection must preserve separate demand semantics. |
| Customer advance | `CustomerAdvance`, `CustomerAdvanceAllocation` | `backend/subscriptions/models.py` | Overpayment/customer credit path. | Liability until applied. | Allocation history required. | Admin/cashier collection control. | Useful for deposits/advance rent if explicitly connected. |
| Payment reconciliation | `PaymentReconciliation`, `PaymentReconciliationEvent` | `backend/subscriptions/models.py` | Expected vs paid amount status. | Flags partial/overpaid/mismatch. | Event log required. | Admin reconciliation/reporting. | Needed for rent/lease demands and deposits. |
| Ledger | `FinancialLedger` | `backend/subscriptions/models.py` | EMI payment/waiver/reversal ledger. | Source of net paid calculations. | Immutable-style financial trace. | Reports, detail timelines. | Keep separate from rent/lease ledger unless bridged. |
| Audit | `AuditLog`, `BusinessEvent` | `backend/subscriptions/models.py` | Human/action and business event history. | No direct money value unless metadata. | Core auditability layer. | Admin timelines/reports. | Must cover future contract events. |
| Lucky draw | `DrawCommitment`, `WinnerHistory` | `backend/subscriptions/models.py` | Commitment/reveal/winner history. | Triggers waiver benefit. | Hash/seed/winner trace. | Admin draw, public winner. | EMI-specific. |
| Commission | `PartnerCommission` | `backend/subscriptions/models.py` | Partner earning against eligible payments. | Payable/expense. | Reverse on payment reversal. | Partner/admin commission pages. | Extend only with clear eligible rent/lease rules. |
| Payout | `PayoutBatch`, `PayoutBatchLine` | `backend/subscriptions/models.py` | Commission settlement batch. | Cash/bank payout control. | Must prevent duplicate payout. | Admin payout pages. | Extend with partner/vendor payouts carefully. |
| Rent/lease profile | `RentSubscriptionProfile`, `LeaseSubscriptionProfile` | `backend/subscriptions/models.py` | Deposit, return condition, refund/deduction state. | Deposit liability/refund/deduction. | Return notes and refund status. | Admin rent/lease contract surfaces. | Core rent/lease extension. |
| Rent/lease demand | `RentLeaseBillingDemand`, `RentLeaseDepositTransaction` | `backend/subscriptions/models.py` | Monthly/security deposit demand and transaction tracking. | Rent/lease receivable, deposit liability/refund. | Transaction type and reason history. | Admin/cashier rent/lease collection surfaces. | Core rent/lease billing. |
| Delivery | `SubscriptionDelivery` | `backend/subscriptions/models.py` | Subscription delivery lifecycle. | Indirect stock/fulfillment impact. | Status timestamps and actor links. | Admin deliveries, print documents. | Supports rent/lease handover/return with explicit rules. |
| Direct sale | `DirectSale`, `DirectSaleLine`, billing invoice/receipt models | `backend/billing/models.py` | Retail sale, invoice, receipt, cancellation/return/exchange. | Direct receivable/revenue/stock/accounting. | Status immutability and source links. | Admin billing, cashier direct sale collection, print. | Separate from EMI contracts. |
| Accounting / reconciliation | `ChartOfAccount`, `FinanceAccount`, `FinanceAccountCoaMapping`, `AccountingPostingProfile`, `JournalEntry`, `JournalLine`, `MoneyMovement`, `ReconciliationItem`; settlement allocation / settlement mapping is a future or needs-confirmation concept, with no exact `SettlementAllocation` model confirmed in current code inspection. | `backend/accounting/models.py`, `backend/reconciliation/models.py` | COA, real money channels, posting profiles, journals, money movement, reconciliation exceptions, and future/confirmed settlement mapping concepts. | Accounting truth and settlement visibility. | Posted records, mappings, and exceptions must be guarded. | Admin accounting/finance setup and reconciliation views. | Required for deposits, rent income, lease income, payouts, and future settlement mapping. |
| Inventory | `StockLocation`, `InventoryItem`, `StockMovement`, purchase/adjustment models | `backend/inventory/models.py` | Stock master, physical and soft-hold movement ledger. | Inventory asset and COGS implications. | Movement history required. | Admin inventory/delivery/direct sale. | Required for rent/lease handover/return condition. |
| Amendment | `ContractAmendment` | `backend/subscriptions/models.py` | Request/review/approved values/implementation metadata. | High-risk changes blocked unless service supports them. | Review and implementation audit required. | Admin/customer/partner amendment pages. | Supports EMI and rent/lease contract types. |
| Branch/staff | `Branch`, `CashCounter` | `backend/branch_control/models.py` | Branch/counter assignment and access. | Payment collection location. | Staff access and counter evidence. | Admin setup, cashier flows. | Needed for rent/lease locations. |
| CRM/support/reminders | CRM, `CustomerSupportRequest`, service desk/reminder models | `backend/crm`, `backend/service_desk`, `backend/reminders` | Leads, support, reminders, operational follow-up. | Indirect collections/sales impact. | Follow-up and ticket lifecycle. | Admin/customer/partner/service desk. | Extendable to rent/lease service lifecycle. |
| Manufacturing/BOM | Manufacturing models | `backend/manufacturing/models.py` | Manufacturing/BOM foundation. | Inventory/cost impact. | Production movement trace. | Admin manufacturing pages. | Future furniture manufacturing. |

## 7. Backend architecture rules

- Models enforce local invariants and cross-field validation, but service modules own multi-record business workflows.
- Views/viewsets must remain thin: permission check, serializer validation, service call, response.
- Serializers validate input/output shape; they must not silently perform financial side effects unless the existing flow explicitly does that.
- Use `transaction.atomic` for subscription creation, payment collection, payment reversal, waiver application, amendment implementation, payout settlement, reconciliation state changes, direct sale posting, inventory movement, delivery lifecycle changes, and business reset.
- Use `select_for_update` where race conditions affect money, EMI status, Lucky ID assignment, batch slot count, stock quantity, commission payout, or confirmed settlement/payment allocation records.
- Admin-only operations must remain admin-only. Cashier, partner, and customer endpoints must never leak admin data.
- Audit logging and business events must be linked to source records.

## 8. Serializer rules

- Serializers must not hide financial state that the UI needs for safe operation.
- Never convert `WAIVED` into `PAID`.
- Expose read-only status, amount, outstanding, reversal, reconciliation, accounting, receipt, and lifecycle state where the UI needs safe buttons.
- Write serializers must validate role/ownership/status transition/money constraints/object existence.
- Never trust client-calculated totals as source of truth. Backend must recompute or verify totals.
- Add display-only serializer fields additively where safe.
- Do not remove fields used by historical pages/tests without compatibility plan.

## 9. Service layer rules

| Service/function/module | Purpose | Must preserve | Must not do | Tests required |
|---|---|---|---|---|
| `subscriptions.services.subscription_service.create_emi_subscription` | Create EMI contract, assign Lucky ID, generate schedule, audit. | Product base price, batch OPEN, Lucky ID lock, deterministic EMI. | Create contracts outside transaction or orphan Lucky IDs. | Subscription creation, duplicate Lucky ID, full batch. |
| `subscriptions.services.emi_engine.generate_emi_schedule` | Build EMI rows. | Deterministic due/month/amount schedule. | Rewrite paid/waived rows casually. | Schedule amount/rounding/status tests. |
| `subscriptions.services.payment_service.record_emi_payment` | Canonical EMI collection path. | Finance account guard, branch/counter, ledger, audit, reconciliation, finance posting. | Collect for waived/paid/cancelled/defaulted/completed EMI or overpay EMI. | Payment, overpay block, waived block, finance account, reconciliation. |
| `subscriptions.services.payment_service.reverse_payment_for_admin` | Admin payment reversal. | Reason required, reversal metadata, ledger reversal, OperationalCancellation, lifecycle event, commission reversal. | Delete original payment or silently edit amount. | Reversal idempotency, lifecycle, ledger net paid. |
| `subscriptions.services.commission_service` | Partner commission create/reverse. | Eligibility and reversal linkage. | Duplicate payable or ignore payment reversal. | Commission create/reverse/payout impact. |
| `subscriptions.services.commission_payout_service` | Payout batches. | Traceable settlement and duplicate protection. | Settle same commission twice. | Payout batch and reversal tests. |
| `subscriptions.services.contract_amendment_service` | Amendment request/review/limited implementation. | Approval separate from implementation; high-risk blocked unless supported. | Reprice, rewrite EMIs, move Lucky IDs, alter accounting/reconciliation without evidence. | Amendment request/review/implementation/block tests. |
| `subscriptions.services.delivery_service` | Subscription delivery lifecycle. | Status timestamps, stock blocking rules, active delivery uniqueness. | Treat delivery as full payment. | Delivery status, stock unavailable, terminal status. |
| `billing.services.*` | Direct sale invoice/receipt/return/exchange sync. | Status immutability, receipt/invoice linkage, stock/accounting sync. | Collect on voided/non-collectible cases. | Direct sale posting, cancellation, return, receipt. |
| `inventory.services.*` | Stock movements and reservations. | Ledger-like stock movement history, soft-hold distinction. | Mutate stock without source movement. | Stock in/out/reserve/return. |
| `accounting.services.*` | Finance posting, COA mapping, journals. | Finance account vs COA separation, posted-entry guard. | Use inactive/system-only accounts for collection. | Posting profile, finance account guard, journal balance. |
| `reconciliation.services.*` | Financial source lifecycle and mismatch checks. | Active/net truth, auditable exceptions. | Auto-repair silently from reports. | Lifecycle exclusion, mismatch flagging. |
| `subscriptions.services.business_reset_service` | Controlled business reset. | Preserve required admin, preview-before-commit. | Delete admin/security data accidentally. | Preview non-mutating, confirm required. |

## 10. API route rules

Confirmed route mount in `backend/api/v1/urls.py`:

- `/api/v1/auth/`
- `/api/v1/admin/`
- `/api/v1/branch-control/`
- `/api/v1/accounting/`
- `/api/v1/inventory/`
- `/api/v1/manufacturing/`
- `/api/v1/billing/`
- `/api/v1/crm/`
- `/api/v1/service-desk/`
- `/api/v1/reminders/`
- `/api/v1/dashboards/`
- `/api/v1/partner/`
- `/api/v1/vendor/`
- `/api/v1/customer/`
- `/api/v1/customers/`
- `/api/v1/cashier/`
- `/api/v1/notifications/`
- `/api/v1/public/`
- `/api/v1/executive/`
- `/api/v1/winner/`

Rules:

- Frontend must not call endpoints that do not exist.
- Route constants and service modules must stay aligned with backend route modules.
- Normalize unstable or paginated payloads inside service modules, not inside many pages.
- Do not expose admin endpoints to public/customer/partner/cashier roles.
- Keep compatibility aliases if tests/frontend still use them; deprecate before removal.

## 11. Frontend architecture rules

- Use Next.js App Router route families under `frontend/src/app/**`.
- Use typed service functions under `frontend/src/services/**`.
- Use shared API client from `frontend/src/lib/api/index.ts`.
- Use auth/session/token utilities under `frontend/src/lib/auth/**`.
- Use route constants from `frontend/src/lib/routes.ts` and config modules where available.
- Keep pages thin; move formatting, normalization, and request logic to services/components.
- Use shared operations components for dashboards, tables, forms, cards, timelines, drilldowns, and workflow panels.
- Every operational page needs loading/error/empty states.
- Mobile and desktop staff workflows must remain usable.

Frontend prohibitions:

- No fake operational buttons.
- No mocked business data in production routes.
- No fabricated KPIs.
- No role-unsafe links.
- No frontend-only financial calculation as source of truth.
- No raw response assumptions spread across pages.

## 12. Auth and role rules

Roles:

| Role | Scope |
|---|---|
| Admin | Full operational control, audit-heavy, internal only. |
| Cashier | Collection-first, counter/branch-scoped, no destructive setup. |
| Partner | Own assigned business, customers/subscriptions/commission visibility only. |
| Customer | Own profile/contracts/payments/support only. |
| Public visitor | Public pages, lead/request forms, product/winner trust content only. |
| Vendor/staff | Only if code route/module is present and permissioned. |

Confirmed frontend behavior:

- `apiFetch` builds URLs against normalized API base, handles `/api/v1` duplication safely, attaches bearer tokens, retries one 401 via refresh, and clears session when refresh fails.

Rules:

- Admin/cashier registration must not be public unless explicitly approved.
- Customer/partner public registration may exist only under approved workflow.
- Refresh must not cause redirect loops.
- Logout must clear access token, refresh token, session, and auth cookie state where implemented.
- Protected pages must not render private data before role verification.
- Sidebar/navigation visibility must follow role permissions.

## 13. Subscription workflow rules

Confirmed EMI creation flow:

1. Select customer.
2. Select product.
3. Select open batch.
4. Select available Lucky ID.
5. Backend calculates total amount from product `base_price`.
6. Backend calculates monthly amount from total/tenure.
7. Backend creates subscription.
8. Backend marks Lucky ID assigned.
9. Backend generates EMI schedule.
10. Backend reconciles schedule.
11. Backend assigns subscription number and contract reference.
12. Backend writes audit/business events.

Rules:

- EMI schedule must be deterministic.
- EMI tenure must match batch duration.
- Subscription amount must align with product base price unless approved override exists in code.
- Changing product/tenure/batch/Lucky ID after activity is high-risk and must go through approved amendment/service flow.
- Do not orphan Lucky IDs.
- Do not silently rewrite paid or waived EMIs.
- One subscription must remain financially independent.

## 14. Contract amendment rules

Confirmed from `subscriptions.services.contract_amendment_service`:

- Amendment review and implementation are separate.
- EMI amendments require EMI subscription source.
- Rent/lease amendments require RENT or LEASE subscription source.
- Direct Sale amendments are not supported by this service.
- Phase 3 implementation is limited to whitelisted non-financial customer contact/address corrections.
- Phase 4 allows only same-price product reference correction.
- Product reference correction preserves total amount, monthly amount, tenure, paid amount, receipt documents, EMI rows, Lucky ID, batch, waivers, accounting journals, reconciliation records, inventory stock, delivery records, commission records, payout records, rent/lease billing, and security deposit.
- Financial product change, EMI changes, lucky ID/batch changes, rent/lease demand/deposit changes, accounting, reconciliation, commission, payout, delivery, stock, and inventory changes remain blocked unless implemented later with evidence and controls.

Rules:

- Approval is not execution.
- Admin acceptance is required before implementation.
- No mutation of contract state without audit.
- Execution must be guarded against duplicate runs.
- Payment/reconciliation/accounting evidence must remain linked where implemented.
- Incomplete high-risk amendment flows must be marked blocked in UI, not hidden as fake buttons.

## 15. EMI and payment rules

Confirmed statuses/methods:

- EMI statuses: `PENDING`, `PAID`, `WAIVED`, `CANCELLED`.
- Payment methods: `CASH`, `UPI`, `BANK`.
- Payment collection path: `record_emi_payment`.
- Admin wrapper: `collect_payment_for_admin`.
- Admin reversal path: `reverse_payment_for_admin`.

Rules:

- Collect money only through hardened service paths.
- Payment date must be persisted.
- Finance account is required or resolved through branch/counter/fallback; inactive/system-only collection accounts are blocked.
- Payment amount cannot exceed EMI outstanding; extra money must be customer advance.
- Cannot collect against waived EMI.
- Cannot collect against already paid EMI.
- Reversed payments must use ledger reversal and OperationalCancellation/lifecycle event; original payment remains traceable.
- Never mark waiver as cash received.
- Customer credit/advance must remain traceable through `CustomerAdvance` and `CustomerAdvanceAllocation`.
- Receipt voiding must preserve original document history.

## 16. Lucky draw rules

Confirmed structures:

- Batch lifecycle includes `READY_TO_LOCK`, `LOCKED`, `DRAW_IN_PROGRESS`, `DRAW_COMMITTED`, `DRAW_COMPLETED`.
- `DrawCommitment` and `WinnerHistory` exist in `subscriptions.models`.
- Lucky ID status includes `AVAILABLE`, `ASSIGNED`, `WON`.

Rules:

- Commit must not reveal winner.
- Reveal must verify commitment.
- Winner receives future EMI waiver only.
- Already paid EMIs remain paid.
- Already due/posted periods must not be silently rewritten unless explicit business rule and tests exist.
- Public winner data must mask private customer data.
- Draw execution must be idempotent/guarded.

## 17. Reconciliation rules

Reconciliation must compare:

- Payment vs expected EMI outstanding.
- Payment allocation vs ledger entry.
- EMI outstanding vs paid/waived/cancelled status.
- Finance account settlement vs payment method/channel.
- Journal/ledger posting vs source payment/receipt/direct sale/demand.
- Cancelled/reversed/voided source lifecycle events vs active reporting totals.

Rules:

- Reconciliation flags mismatches; reports must not silently repair data.
- Exceptions must be auditable.
- Cancelled/reversed/voided records must be excluded from active totals or shown separately according to domain truth.
- Day close and reports must use active/net lifecycle truth, not raw gross rows.

## 18. Accounting and finance rules

Definitions:

- `ChartOfAccount`: accounting head such as asset/liability/income/expense.
- `FinanceAccount`: real money location/channel such as cash desk, bank, UPI/gateway; must map to an asset chart account.
- `FinanceAccountCoaMapping`: purpose-specific mapping from finance channel to COA purpose.
- `AccountingPostingProfile`: system-only posting role such as receivable/income/commission payable/waiver loss.
- `JournalEntry`/`JournalLine`: accounting posting record.
- `MoneyMovement`: confirmed accounting-side money movement record where present in `backend/accounting/models.py`.
- `ReconciliationItem`: confirmed reconciliation exception/review record in `backend/reconciliation/models.py`.
- Settlement allocation / settlement mapping: future or needs-confirmation concept; no exact `SettlementAllocation` model confirmed in current code inspection.

Rules:

- Finance account is not the same thing as chart account.
- EMI collection reduces receivable or posts according to the approved accounting model.
- UPI clearing may settle to bank.
- Customer advance is liability until applied.
- Security deposit is liability/refundable unless deducted by rule.
- Payout and commission must be traceable.
- Opening balances and posted journals must be guarded from unsafe edits.
- Rent/lease mappings must use income/liability/refund/damage recovery accounts as validated by accounting models.

## 19. Rent and lease rules

Confirmed from code:

- `PlanType` supports `EMI`, `RENT`, `LEASE`.
- `Product` has rent/lease enablement flags.
- `Subscription` supports plan type and forbids batch/Lucky ID for non-EMI contracts.
- `RentSubscriptionProfile` and `LeaseSubscriptionProfile` enforce security deposit percent 20–30.
- `RentLeaseBillingDemand` supports monthly rent, monthly lease, and security deposit demands.
- `RentLeaseDepositTransaction` tracks collection, refund approval/refund, deduction, and reason.

Rules:

- Rent/lease must extend the existing subscription/contract architecture; it must not replace EMI logic.
- Deposits are not income.
- Monthly rent/lease demand is separate from EMI semantics.
- Contract events must be explicit.
- Delivery/handover, return inspection, condition, deposit refund/deduction, and buyout/transfer must be auditable.

## 20. Direct sale rules

Confirmed from billing code:

- `DirectSale` supports draft, confirmed, delivered, invoiced, cancelled, returned, exchanged, reversed, archived states.
- Direct sale has customer snapshots, finance account, branch/counter, delivery snapshot, totals, idempotency fields, and tax mode.
- Immutable status guard blocks unsafe edits after terminal/posting states, except approved transitions.

Rules:

- Direct sale outstanding must not include voided, returned, reversed, archived, cancelled, or non-collectible cases.
- Collection action must be blocked for reversed/archived/cancelled/non-collectible cases.
- Returns/exchanges must preserve audit and stock movement.
- Receipts must remain linked to invoice/payment/source sale.
- Direct sale must not be treated as EMI subscription.

## 21. Delivery and fulfillment rules

Confirmed from code:

- `SubscriptionDelivery` stores delivery reference, lifecycle status, scheduled/dispatched/out-for-delivery/delivered/failed/cancelled/return timestamps, receiver details, address snapshot, failure/stock blocked reason, and actor fields.
- Active subscription delivery uniqueness is enforced for active statuses.

Rules:

- Delivery does not imply full payment unless explicitly coded.
- Stock and delivery state are separate from payment state.
- Exceptional delivery release must be admin-approved where implemented.
- Return pickup and return condition must be auditable.
- Print output must use persisted delivery data.

## 22. Inventory and stock rules

Confirmed from inventory code:

- `StockLocation` identifies store/warehouse/showroom locations.
- `InventoryItem` links one-to-one with `Product`, tracks SKU/UOM, opening stock, reorder level, valuation, stock tracking, manufacturing cost fields.
- `StockMovementType` includes purchase, sale, EMI delivery, return, production, transfer, adjustment, reserve/release, damage, maintenance, and quality hold/release.
- Soft-hold movement types do not affect physical stock calculation.

Rules:

- Stock movement must be ledger-like and auditable.
- Never update stock silently without source document/action.
- Reserved stock and available/physical stock must not be confused.
- Direct sale, delivery, return, exchange, rent/lease handover, rent/lease return, and manufacturing must create proper movement history.

## 23. Commission and payout rules

Rules:

- Commission must tie to real eligible transactions.
- Payment reversal must reverse associated commission where service implements it.
- Payout batch must not settle the same commission twice.
- Payout batches and lines must remain traceable to partner, commission, payment, and settlement/accounting evidence.
- Reversal/cancellation must not leave stale payable state.

## 24. Customer, partner, cashier, admin UI workflow rules

| Role | Dashboard purpose | Allowed actions | Blocked actions | Visible data | Safety rules |
|---|---|---|---|---|---|
| Admin | Full operations command center. | Setup, products, customers, subscriptions, batches, draw, billing, delivery, accounting, reconciliation, reports, amendments. | None by role, but high-risk actions require confirmation/audit. | Business-wide. | Audit-heavy, no silent financial edits. |
| Cashier | Collection and receipt workspace. | Search due items, collect allowed payments, view receipts/day close/counter scope. | Admin setup, destructive config, unsafe reversal unless allowed endpoint exists. | Branch/counter/customer collection data. | Must use finance account/counter controls. |
| Partner | Own/customer-assigned business. | View own customers/subscriptions/collections/commission, create approved requests if enabled. | Admin data, global finance setup, other partner data. | Own scope only. | No privacy leakage. |
| Customer | Self-service account. | View own contracts, EMIs, payments, support, profile. | Internal data, admin/cashier actions. | Own records only. | No cross-customer access. |
| Public | Trust and lead generation. | Public product, winner, policy, lead/request pages only. | Private account data. | Public-safe only. | Mask customer private data. |

## 25. Smart form rules

- Use search-first selectors for customer, product, batch, Lucky ID, finance account, address, and branch/counter.
- Autofill safe snapshots from selected records.
- Show derived values as backend-calculated or backend-verified.
- Explain why high-risk data is required.
- Show backend validation errors in staff-friendly language.
- Prevent duplicate submissions and duplicate references/idempotency keys.
- Dangerous actions require explicit confirmation phrase or boolean confirmation as backend expects.
- Do not ask staff to fill values backend can derive safely.
- Do not hide financial consequences.

## 26. Dashboard and reporting rules

- Dashboard is an operations command center, not only KPI cards.
- Separate executive summary from operational queues/reports.
- No fabricated KPIs.
- Active KPIs must exclude cancelled/reversed/voided records or show them separately.
- Include queues, alerts, drilldowns, exceptions, and next-action links.
- Role-specific dashboards must match role permissions and daily work.

## 27. Document/print/PDF rules

- Invoice, receipt, subscription contract, and delivery print routes must reflect persisted backend data.
- Do not generate legal/financial documents from frontend-only fake state.
- Void/reprint/version history must remain traceable where implemented.
- Branded documents must not alter financial truth.
- Subscription documents use typed document records such as KYC, contract PDFs, payment receipt PDF, delivery handover note, amendment record, direct sale invoice PDF, security deposit receipt PDF.

## 28. Import, onboarding, backup, reset rules

- Real secrets stay outside Git.
- Real customer/business data belongs in the database, not source files.
- Import preview must be non-mutating.
- Business reset must preserve required admin account where implemented.
- Reset execution must require explicit confirmation.
- Backup before migration/reset.
- Environment templates may contain placeholders only.
- Customer/product/subscription import templates must match actual serializer/model fields; uncertain fields must be documented, not invented.

## 29. Migration rules

- Additive migrations by default.
- Prefer nullable fields, defaults, and backfills.
- Enum expansion is safer than enum rewrite.
- Do not drop columns/tables without owner approval and historical-data review.
- Every migration touching money, status, or relationships needs rollback notes and production backup plan.
- Backfill scripts must be idempotent.
- Never migrate by editing historical money values without audit/reconciliation plan.

## 30. Testing and release rules

Backend checks should include:

- `manage.py check`
- migration check
- subscription tests
- payment tests
- lucky draw tests
- reconciliation tests
- auth/permission tests
- direct sale/billing tests
- delivery/inventory tests where present
- amendment tests where present
- commission/payout tests where present

Frontend checks should include:

- `npm run lint`
- `npm run typecheck`
- `npm run build` or `npm run validate`
- Playwright smoke tests
- role navigation tests
- payment/receipt tests
- dashboard tests

Release candidate script:

- `bash scripts/run-release-candidate.sh` runs backend validation, frontend validation, deterministic Playwright smoke, and auth smoke.
- Do not push/deploy money-flow changes unless RC is green.
- Document test results in handoff.

## 31. Safe additive upgrade workflow

1. Create branch from `update`.
2. Inspect current code first.
3. Identify affected domain.
4. Classify risk:
   - P0: financial/audit/security.
   - P1: workflow/API integration.
   - P2: UI/docs/cleanup.
5. Check model impact.
6. Check serializer impact.
7. Check service impact.
8. Check API impact.
9. Check frontend service impact.
10. Check UI impact.
11. Add/update tests.
12. Run validation.
13. Commit with clear message.
14. Push only after clean status and passing checks.

## 32. Deletion and cleanup rules

| Classification | Meaning |
|---|---|
| Delete now | Proven unused, no historical/API/test/frontend dependency, no compatibility need. |
| Migrate then delete | Used by data/API/tests/UI; migrate references and provide compatibility first. |
| Keep | Financial, audit, historical, API, or active workflow dependency. |
| Keep temporarily for compatibility | Legacy path/field still used by frontend/tests/docs or external operator workflow. |

Rules:

- Do not delete compatibility routes without checking frontend, tests, and docs.
- Do not delete fields used by historical financial/audit data.
- Remove fake/dead UI only when no live route depends on it.
- Prefer deprecation notes before removal.

## 33. Future feature extension rules

| Module | Extension rule |
|---|---|
| Rent/lease | Extend `Subscription` plan types, profiles, demands, deposits, return inspection, accounting hooks. |
| Manufacturer marketplace | Add vendor/fulfillment contracts and commission rules without breaking direct sale/subscription data. |
| Vendor/customer fulfillment | Use delivery/source records and stock movements; do not blur payment state. |
| HR/staff | Keep payroll/attendance/expense posting guarded and separate from customer money. |
| Service desk | Link tickets to customer/contract/payment/delivery where relevant. |
| Reminders | Use scheduled notifications without mutating money. |
| Manufacturing/BOM | Connect BOM to inventory and cost accounting through explicit stock movements. |
| CRM/lead pipeline | Leads may convert to customer/subscription/direct sale through service path. |
| Advanced reporting | Read-only by default; reports must not repair data silently. |

## 34. File map

### Backend

- `backend/core/urls.py` – root URL mount including `/api/v1/`.
- `backend/core/settings/**` – settings/environment.
- `backend/api/v1/urls.py` – API route family includes.
- `backend/api/v1/routes/**` – auth/admin/customer/partner/cashier/accounting/inventory/billing/etc route modules.
- `backend/api/v1/views/**` – DRF views/viewsets.
- `backend/api/v1/serializers/**` – API serializers.
- `backend/subscriptions/models.py` – core Lucky Plan/subscription/payment/draw/rent/lease models.
- `backend/subscriptions/services/**` – subscription, payment, draw, amendment, commission, delivery, reset services.
- `backend/accounting/models.py`, `backend/accounting/services/**` – COA, finance accounts, journal/posting logic.
- `backend/billing/models.py`, `backend/billing/services/**` – direct sale, invoice, receipt, billing sync.
- `backend/inventory/models.py`, `backend/inventory/services/**` – stock locations/items/movements/purchase/adjustment.
- `backend/branch_control/**` – branch/cash counter/access services.
- `backend/crm/**`, `backend/service_desk/**`, `backend/reminders/**`, `backend/manufacturing/**` – extension modules.
- `backend/tests/**` – backend API/domain/accounting/inventory/reconciliation tests.

### Frontend

- `frontend/src/app/**` – App Router pages for public, admin, cashier, customer, partner, vendor, dashboards.
- `frontend/src/services/**` – typed API service modules.
- `frontend/src/lib/api/index.ts` – canonical API client.
- `frontend/src/lib/auth/**` – token/session/auth helpers.
- `frontend/src/lib/routes.ts` – route constants.
- `frontend/src/components/**` – shared UI, guards, operations components, module components.
- `frontend/src/config/**` – app/navigation/config data.
- `frontend/tests/**` – Playwright and frontend tests.
- `frontend/package.json` – frontend validation/build/test scripts.

### Docs/scripts/config

- `AGENTS.md` – project identity and guardrails.
- `docs/**` – business, deployment, operations, handoff documentation.
- `scripts/run-release-candidate.sh` – top-level RC validation orchestration.
- `backend/scripts/**` and `frontend/scripts/**` – validation/build helpers.
- `backend/.env*`, `frontend/.env*` – environment files/templates; real secrets must not be committed.

## 35. Change review checklist

Every change must answer:

- Existing data impact?
- Financial integrity impact?
- Auditability impact?
- Daily shop usability impact?
- Future rent/lease compatibility impact?
- API contract impact?
- Migration needed?
- Test coverage?
- Role permission impact?
- Reconciliation impact?
- Accounting impact?
- Deployment impact?
- Rollback plan?

## 36. Glossary

| Term | Meaning |
|---|---|
| Lucky Plan | Batch/Lucky ID based furniture EMI subscription program. |
| EMI | Monthly installment row tied to a subscription. |
| Lucky ID | Two-digit slot number in a batch, 00–99. |
| Batch | Lucky Plan group with slots, duration, draw day, and draw lifecycle. |
| Waiver | Non-cash EMI benefit; not a payment. |
| Subscription | Contract record for EMI, rent, or lease plan. |
| Contract amendment | Auditable request/review/implementation workflow for contract changes. |
| Reconciliation | Comparison of expected vs actual financial/source records. |
| Finance account | Real money channel/location such as cash, bank, UPI. |
| Chart account | Accounting ledger head such as asset/liability/income/expense. |
| Ledger entry | Financial trace row for payment/waiver/reversal. |
| Payment allocation | Linking received money/customer advance to EMI/contract obligation. |
| Commission | Partner earning tied to eligible transaction. |
| Payout batch | Settlement grouping for commission payout. |
| Direct sale | Retail invoice/sale flow outside EMI subscription. |
| Delivery case | Fulfillment/handover lifecycle record. |
| Stock movement | Ledger-like inventory quantity movement. |
| Security deposit | Rent/lease refundable liability subject to deduction/refund rules. |
| Rent | Contract plan with monthly rent and security deposit. |
| Lease | Contract plan with monthly lease/security deposit and possible buyout/transfer rules. |
| Audit log | Persistent action/business event trail for accountability. |

## 37. Open questions and confirmed gaps

| Item | Status | Action required |
|---|---|---|
| Lucky draw exact waiver cutoff logic | Needs confirmation before change | Inspect draw/waiver service and tests before altering winner behavior. |
| High-risk amendments for Lucky ID/batch/EMI/tenure/price/deposit/accounting/reconciliation | Confirmed blocked by current service | Implement only through future audited phases with previews, evidence, tests. |
| Direct Sale amendments | Confirmed unsupported by `contract_amendment_service` | Add separate design if owner approves. |
| Rent/lease full operational maturity | Partially confirmed | Profiles/demands/deposit transactions exist; inspect UI/services before expanding. |
| Bulk subscription import | Needs confirmation | Do not invent if endpoint/service is absent. |
| Markdown lint tooling | Not found in repository search | Do not add tooling during docs-only pass. |
| Compatibility/legacy paths | Present across route aliases and status aliases | Check frontend/tests before deleting. |
| Full codebase route inventory | Should be regenerated by existing scripts when changing routes | Use frontend `check:routes`/inventory scripts. |
