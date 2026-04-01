# AGENTS.md

## Project Identity

This repository contains the production system for **SUBIDHA CORE – Lucky Plan EMI System**.

This is not a demo app.
It must work under real furniture retail business conditions.

Primary business today:
- Lucky Plan EMI subscription management
- Customer enrollment
- Product and batch management
- EMI schedule generation
- Payment collection and reconciliation
- Lucky draw workflow
- Admin, partner, and customer access

Future expansion:
- Furniture rental
- Furniture leasing
- Manufacturer-to-customer marketplace

All changes must preserve backward compatibility for current Lucky Plan EMI data and workflows.

---

## Core Product Rules

1. One customer may have multiple subscriptions.
2. One customer may hold multiple Lucky IDs across different products or batches.
3. Each subscription is financially independent.
4. EMI records must be auditable and never silently altered.
5. Payment history is append-only in spirit:
   - prefer reversal/adjustment entries over destructive mutation
   - preserve auditability
6. Lucky draw logic must not corrupt payment logic.
7. Winning a draw may waive future EMI obligations only according to business rules;
   never retroactively modify already-settled payments.
8. Product delivery state, contract state, payment state, and draw state are separate concerns.
9. Schema evolution must be additive and non-breaking unless explicitly approved.
10. The system must remain extensible for future RENT and LEASE plans.

---

## Architecture Expectations

Use a clean full-stack architecture.

### Backend
Preferred stack:
- Django or FastAPI backend
- PostgreSQL database
- JWT authentication
- Service-oriented business logic
- Clear separation:
  - models
  - serializers / schemas
  - services
  - views / routers
  - permissions
  - audit / reconciliation logic

### Frontend
Preferred stack:
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form where forms are complex
- Zod validation where appropriate
- Role-based dashboard layouts

### Roles
Support these roles cleanly:
- Admin
- Partner
- Customer
- Public visitor

Never mix role permissions casually in frontend or backend.

---

## Non-Negotiable Engineering Rules

1. Do not break existing APIs unless explicitly instructed.
2. Do not rename fields casually if existing data or frontend depends on them.
3. Before changing models, evaluate:
   - migration impact
   - existing subscription data impact
   - EMI calculation impact
   - reconciliation impact
   - future rental/leasing compatibility
4. Prefer additive migrations:
   - new nullable columns
   - new tables
   - new enums with backward-safe defaults
5. Never hardcode business values that may later become configurable.
6. Avoid fat components and fat views.
7. Put domain logic in services, not scattered across UI or route handlers.
8. Write defensive code for nulls, partial records, and malformed API data.
9. Optimize for operational simplicity for store staff.
10. Keep UI enterprise-grade but practical, not decorative.

---

## Domain Modeling Guidance

Keep these domains conceptually separate:

- Customer
- Partner
- Product
- Batch
- Lucky ID
- Subscription / Contract
- EMI Schedule
- Payment
- Waiver / Winner Benefit
- Financial Ledger
- Delivery / Fulfillment
- Audit Log

Never collapse these concepts into one overloaded table or one oversized frontend page model.

---

## Lucky Plan Business Logic Guidance

When implementing Lucky Plan behavior:

- Subscription creation must validate:
  - customer
  - product
  - batch
  - tenure
  - monthly amount
  - total contract amount
  - lucky ID uniqueness within scope
- EMI schedule generation must be deterministic and reproducible.
- Payment posting must update EMI status safely.
- Reconciliation must detect mismatches between:
  - subscription total
  - EMI total
  - collected payments
  - waived amounts
  - outstanding balance
- Draw winner processing must be idempotent.
- Admin actions that affect money must be logged.

If uncertain, preserve data and auditability over convenience.

---

## Frontend UX Guidance

Build for daily operational use by non-technical staff.

### UX principles
- Fast page load
- Clear tables
- Clear filters
- Strong search
- Safe forms
- Confirmation for destructive actions
- Readable status badges
- Mobile-friendly where practical, desktop-first for admin
- Avoid clutter

### Admin UX priorities
- Dashboard with operational KPIs
- Search-first workflows for large datasets
- Bulk-safe but controlled admin actions
- Clear detail pages for customer, subscription, payment, batch, draw
- Audit visibility
- Reconciliation visibility

### Form design
- Prefer searchable selectors over huge dropdowns
- Autofill known linked fields when safe
- Show derived values clearly
- Validate before submit
- Show exact backend error messages in readable form

---

## Code Change Policy for Codex

When making changes:

1. First inspect the existing codebase and understand current conventions.
2. Reuse existing patterns where reasonable.
3. If architecture is weak, improve it incrementally without destabilizing working flows.
4. Prefer small, reviewable diffs.
5. For larger work, stage changes in vertical slices:
   - schema / backend
   - API
   - frontend integration
   - validation
   - testing
6. Do not generate placeholder logic and call it complete.
7. Do not leave dead code or duplicate components unless explicitly transitional.
8. If creating new files, place them in the correct architectural boundary.
9. If changing a public interface, update all affected usage points.

---

## Testing Expectations

For backend changes, include:
- serializer/schema validation coverage
- service-layer tests
- reconciliation/business rule tests
- permission tests where relevant

For frontend changes, include:
- loading state
- empty state
- error state
- success state
- defensive handling of partial API payloads

When feasible, add tests. If tests are not added, explain the risk.

---

## Output Expectations

When completing a task, always report:
1. What changed
2. Why it changed
3. Impact on existing data
4. Impact on EMI logic
5. Impact on future rental/leasing extensibility
6. Any migration or deployment caution

---

## What to Avoid

Do not:
- rewrite the whole project without need
- replace working business rules with generic SaaS assumptions
- introduce breaking schema changes casually
- move financial logic into frontend
- use mock data in production paths
- hide business-critical assumptions
- overengineer with unnecessary microservices

---

## Preferred Working Style

For major tasks:
1. inspect relevant files first
2. propose the minimal correct architecture
3. implement in production-ready form
4. preserve backward compatibility
5. explain tradeoffs clearly

Act as a senior full-stack engineer and system architect for a real retail-financial workflow.
