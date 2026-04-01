# SUBIDHA CORE – Frontend Customization and Modification Plan

## 1. Objective

This document defines the frontend customization and modification plan for **SUBIDHA CORE – Lucky Plan EMI System** so the developer team can convert the current application into a fluent, production-usable, daily-operation web app for real shop usage.

This plan is based on the approved project direction:

- Keep current architecture intact
- Do not restart frontend structure from scratch
- Use additive and non-breaking improvements only
- Preserve backend contract compatibility wherever possible
- Improve operational flow for admin, cashier, partner, and customer users
- Keep future rent/lease expansion compatible with current EMI-first design

---

## 2. Frontend Target Outcome

The frontend should become:

- Faster to operate during daily business
- Easier for non-technical staff to use
- More consistent across all dashboards
- Better connected to real backend APIs
- More complete in workflow coverage
- Visually cleaner and more trustworthy for business use
- Extensible for future modules without redesigning current screens

The final frontend should support:

- Full admin control of products, customers, batches, subscriptions, payments, lucky draw workflows, reports, partner oversight, and internal users
- Faster cashier collection workflow
- Clear partner workspace for customer assignments, subscriptions, commissions, and payment tracking
- Functional customer portal for subscription visibility, payment visibility, profile, and support

---

## 3. High-Level Frontend Problems To Solve

### 3.1 Workflow fragmentation
Several screens exist, but the overall flow is not yet smooth enough for real operational use. Users can land on pages that are visually acceptable but do not complete the business workflow end-to-end.

### 3.2 Inconsistent dashboard patterns
Some pages use different layout, spacing, actions, filter placement, and summary structures. This creates friction for daily operators.

### 3.3 Weak list-detail-action continuity
In several areas, list pages do not lead smoothly into detail pages, edit pages, create pages, or next-step actions.

### 3.4 Uneven API integration
Some pages are fully backend-driven, while others still use incomplete assumptions, partial fields, or placeholder patterns. The developer team must normalize this.

### 3.5 Missing operational cues
Daily-use systems need strong status badges, overdue alerts, payment state indicators, draw state indicators, and clear empty/error/success states.

### 3.6 Navigation clutter and route duplication
Legacy or overlapping routes can confuse users and developers. The visible navigation must be consolidated around real workflows.

### 3.7 Mobile and tablet usability gaps
The application is primarily desktop-first for office use, but it should still remain usable on mid-size tablets and smaller screens without layout breakage.

---

## 4. Frontend Design Direction

### 4.1 Core visual direction
The UI should feel:

- Professional
- Minimal but not plain
- Trustworthy for finance-related activity
- Fast to scan
- Consistent across all roles

### 4.2 Operational design principles

- Every major page should answer: what is the current state, what needs attention, and what action should the operator take next?
- Important actions should not be buried deep in the screen.
- Tables should support search, filter, quick actions, and clear status indicators.
- Detail pages should summarize key facts first, then show secondary sections below.
- Forms should prevent operator confusion with strong labels, helper text, and validation.
- Empty and error states must explain what the user can do next.

### 4.3 Shared UI pattern rules
All major modules should use a common structure:

1. Page header
2. KPI or summary strip where useful
3. Action bar
4. Filter/search area
5. Main content table or detail section
6. Contextual side information if needed
7. Pagination / result summary / export actions where relevant

---

## 5. Role-Based Frontend Customization Plan

## 5.1 Admin Portal

The admin portal is the highest priority because it is the business control center.

### Admin modules to refine

- Dashboard
- Customers
- Products
- Batches
- Lucky IDs
- Subscriptions
- EMIs
- Payments
- Draw/Winner workflows
- Reports
- Partner management
- Internal user settings

### Admin portal outcome
The admin should be able to run daily operations without needing backend access, database inspection, or developer support for normal work.

---

## 5.2 Cashier Portal

The cashier workflow should be optimized for speed and low training effort.

### Cashier needs

- Search customer quickly
- View pending EMIs quickly
- Collect payment quickly
- Confirm receipt clearly
- Avoid wrong EMI selection
- See recent collections
- See overdue context without noise

### Cashier portal outcome
The cashier should complete collections in the fewest clicks possible while still preserving correctness.

---

## 5.3 Partner Portal

The partner portal should focus on customer assignments, subscriptions, collections, commissions, and performance visibility.

### Partner needs

- Clear dashboard summaries
- Assigned customer list
- Assigned subscription list
- Commission ledger visibility
- Collection request flow
- Payment-linked visibility where permitted

### Partner portal outcome
The partner should feel guided, not overloaded.

---

## 5.4 Customer Portal

The customer portal should be simpler than admin/partner areas.

### Customer needs

- Dashboard with plan status
- Subscription detail
- EMI schedule visibility
- Payment history visibility
- Profile management
- Support access

### Customer portal outcome
The customer should always understand their current plan status and due position.

---

## 6. Detailed Module-by-Module Customization Plan

## 6.1 Admin Dashboard

### Current goal
Make the dashboard the operational control panel, not just a welcome page.

### What the page must show

- Total active subscriptions
- Today collections
- Overdue EMI count
- Pending verification / flagged items if relevant
- Current open batches
- Recent payments
- Recent winners / draw status
- Fast links to create subscription, collect payment, overdue EMI, payments, and reports

### Required customization

- Strong top KPI cards
- Business-health section
- Today operations section
- Financial activity section
- Draw/winner section
- Quick action shortcuts
- Clear status colors and trend indicators
- Better card density and spacing for real office workflow

### Developer instruction
Use the dashboard to reduce navigation burden. Important operational actions should be reachable within one click.

---

## 6.2 Customers Module

### Goals
Make customer management reliable and fast.

### Pages required

- Customer list
- Customer create
- Customer detail
- Customer edit

### Required customization

#### Customer list
- Search by name, phone, customer code
- Status filter
- Assigned partner filter if applicable
- Quick access to subscriptions and payment history
- Table columns optimized for operator scanning
- Bulk-friendly layout, but no destructive bulk actions unless explicitly approved

#### Customer detail
- Customer summary card
- KYC or verification status area
- Subscription list section
- Payment summary section
- Contact info section
- Audit-relevant timeline if available

#### Customer form
- Cleaner field grouping
- Better validation messages
- Strong required-field indication
- Duplicate phone/email prevention UX

### Developer instruction
Customer detail must behave like a parent business profile page, not just a plain record view.

---

## 6.3 Products Module

### Goals
Make product setup structured and future-safe.

### Pages required

- Product list
- Product create
- Product detail
- Product edit

### Required customization

#### Product fields to highlight
- Product name
- Product code
- Category
- Subcategory
- Description
- Base price as total contract price
- Default tenure months
- Derived monthly EMI preview
- Active/inactive status

#### Product list
- Search by product name/code
- Category and subcategory filters
- Status filter
- Quick view/edit actions

#### Product create/edit
- Category and subcategory support
- Description editor area
- EMI preview block: monthly = base price / tenure months
- Validation guidance for business staff

#### Product detail
- Product summary
- Pricing summary
- Tenure rules
- Subscription usage count if available
- Last updated metadata

### Developer instruction
This module must clearly communicate that base price is the total contract price, not a per-month price.

---

## 6.4 Batches Module

### Goals
Make batch administration less error-prone and more visible.

### Pages required

- Batch list
- Batch create
- Batch detail
- Batch edit

### Required customization

#### Batch list
- Search by batch code
- Status filter (open/closed)
- Start date filter
- Draw day visibility
- Occupancy visibility
- Quick action to view Lucky IDs and subscriptions

#### Batch detail
- Batch summary
- Open/closed state
- Start date, duration, draw day
- Occupancy status
- Available / assigned / won Lucky ID counts
- Related subscriptions
- Draw history section

#### Batch form
- Clear guidance on draw day rules
- Total slot explanation
- Close batch safeguards

### Developer instruction
Batch detail must make operational risk obvious, especially occupancy and draw readiness.

---

## 6.5 Lucky IDs Module

### Goals
Improve visibility into slot usage and assignment.

### Required customization

- Search/filter by batch
- Status filter: available, assigned, won
- Better lucky number formatting (00–99)
- Quick linkage to subscription/customer when assigned
- Batch detail integration so standalone use is minimal

### Developer instruction
Lucky IDs should mainly support batch and subscription workflows, not behave as an isolated module for daily use.

---

## 6.6 Subscriptions Module

### Goals
Make subscription operations one of the strongest workflows in the app.

### Pages required

- Subscription list
- Subscription create wizard
- Subscription detail
- Subscription edit where allowed

### Required customization

#### Subscription list
- Search by subscription number, customer, phone, batch, lucky number
- Filters for status, product, batch, partner, plan type
- Highlight won subscriptions clearly
- Highlight overdue subscriptions clearly
- Quick actions to detail, payment view, customer detail

#### Subscription create
- Guided step-based flow
- Customer selection
- Product selection
- Batch selection
- Lucky ID selection or auto-assignment
- Computed summary before submit
- Monthly amount preview
- Start date and tenure validation

#### Subscription detail
- Summary card with customer, product, batch, lucky number, plan type, status
- Financial summary card: total, paid, waived, outstanding
- Winner state visibility
- EMI schedule table
- Payment history section
- Related customer and partner section
- Audit/timeline section if available

### Developer instruction
Subscription detail is one of the most important operational screens. It should be treated like a contract control page.

---

## 6.7 EMI Module

### Goals
Make EMI tracking operationally precise.

### Required customization

- EMI list with overdue filters
- Better due date highlighting
- Clear status badges: pending, paid, waived
- Strong overdue indicators
- Subscription-linked navigation
- Batch/customer filters where useful

### Developer instruction
The overdue workflow should allow staff to identify actionable cases quickly without losing financial clarity.

---

## 6.8 Payments Module

### Goals
Make payment operations fast, accurate, and auditable.

### Pages required

- Payment list
- Payment create / collect
- Payment detail
- Reconciliation views

### Required customization

#### Payment list
- Search by payment reference, subscription, customer, phone
- Method filter
- Date range filter
- Reversal state filter
- Quick link to detail and subscription
- Daily collection visibility

#### Payment create
- Preselected subscription/EMI support
- Subscription search using correct query parameter behavior
- Payment method selection
- Reference number support for UPI/BANK
- Amount confirmation and validation
- Receipt-success state after submit

#### Payment detail
- Payment summary
- Linked subscription and EMI
- Ledger/timeline visibility
- Reversal visibility if present
- Commission impact if relevant and permitted

#### Reconciliation
- Highlight mismatches, flagged states, and repair-required data clearly
- Present business-safe explanations, not just raw technical numbers

### Developer instruction
Payments must feel safe. This area should have the cleanest validation, status messaging, and audit visibility in the entire frontend.

---

## 6.9 Draw / Winner Workflow

### Goals
Make winner workflow visible and trustworthy.

### Required customization

- Draw state visibility at batch level
- Winner display cards
- Draw history screen or section
- Commit/reveal workflow exposure only where appropriate
- Winner subscription detail visibility
- Clear waived future EMI visibility on winning subscriptions

### Developer instruction
This workflow affects user trust. The frontend must explain outcomes clearly and avoid confusion around waived versus paid EMIs.

---

## 6.10 Reports Module

### Goals
Make reports useful for decision-making, not just a navigation page.

### Required customization

- Reports overview dashboard
- Revenue summary report
- Overdue EMI report
- Batch performance report
- Payment trend or collection summary blocks
- Export-ready tables where allowed

### Developer instruction
The reports area should help admin answer daily questions quickly:

- how much was collected today?
- which customers are overdue?
- which batches are performing well?
- what needs action now?

---

## 6.11 Partner Management

### Goals
Improve partner visibility without overcomplicating operations.

### Required customization

- Partner list with commission percentage visibility
- Partner detail with assigned customers and subscriptions
- Commission ledger screen
- Audit-friendly display of commission rate changes if supported

### Developer instruction
The UI should show backend truth from the commission ledger, not frontend-derived estimates.

---

## 6.12 Internal User Management

### Goals
Improve control over admin/cashier/internal roles.

### Required customization

- Internal user list
- Create/edit flows
- Activation status visibility
- Role badges
- Audit section for internal-user changes if available

### Developer instruction
This area should feel administrative and controlled, not promotional or casual.

---

## 7. Cross-Cutting Frontend Improvements

## 7.1 Navigation cleanup

The navigation should be organized around actual business workflows.

### Admin navigation structure
Suggested grouping:

- Overview
  - Dashboard
- Operations
  - Customers
  - Products
  - Batches
  - Subscriptions
  - EMIs
  - Payments
- Draw & Monitoring
  - Lucky IDs
  - Draws / Winners
  - Reports
- People & Settings
  - Partners
  - Internal Users
  - Settings

### Required action
Remove or redirect duplicate, legacy, or dead-end routes from visible menus.

---

## 7.2 Shared page shell standardization

All dashboard pages should use the same base shell behavior for:

- page title
- breadcrumbs
- summary metrics
- actions
- loading state
- error state
- empty state
- content spacing

### Required action
Unify around existing shared shell components instead of making custom layout logic per page.

---

## 7.3 Table system consistency

All major register/list pages should support a common interaction model:

- search
- filter
- pagination
- row actions
- result count
- optional export
- status badge rendering
- loading skeletons

### Required action
Normalize table usage through shared table components and typed column definitions.

---

## 7.4 Form UX standardization

Forms should use a repeatable structure:

- sectioned layout
- helper text
- validation messages
- submit state
- cancel/back action
- success feedback

### Required action
Reduce ad hoc form layouts. Use common field wrappers and messaging rules.

---

## 7.5 Status system normalization

All modules should use consistent status badge styles and wording.

### Status areas to normalize

- subscription status
- EMI status
- batch status
- lucky ID status
- internal user active/inactive
- payment reversal state
- verification states where relevant

### Required action
Create shared badge rendering helpers and map backend values consistently.

---

## 7.6 Error, loading, and empty states

The frontend should never leave the operator guessing.

### Required action
Every data page should have:

- loading skeleton or loading block
- recoverable error state with retry
- empty state with explanation and action
- submission success/failure messaging

---

## 7.7 Permission and role-guard consistency

### Required action
- Ensure role-based route protection is aligned with actual routes
- Prevent users from landing in unauthorized or broken areas
- Keep redirects predictable after login

---

## 7.8 Responsive behavior

### Required action
- Preserve desktop-first design
- Improve tablet layout for tables and forms
- Ensure key actions stay accessible on narrower screens
- Avoid horizontal overflow on important KPI and summary cards

---

## 8. Backend API Alignment Requirements For Frontend Team

The frontend team should not silently compensate for missing or mismatched backend behavior in unsafe ways.

### Required API alignment rules

- Use backend truth for financial summaries
- Do not estimate commission on frontend if backend ledger exists
- Do not compute authoritative payment state only on frontend
- Use backend status enums directly where possible
- Use approved query params for search/filter flows
- Avoid hardcoded mock transformations unless explicitly temporary

### If frontend finds missing backend support
The developer team should log it as one of these:

- Required API fix
- Optional API enhancement
- Frontend-safe fallback

---

## 9. Technical Frontend Workstream Breakdown

## Workstream A – Layout and Design System Refinement

### Scope
- shared shell cleanup
- page header consistency
- toolbar/action patterns
- badge/tone system
- summary card system
- section wrappers

### Priority
P1

---

## Workstream B – Admin Workflow Completion

### Scope
- dashboard
- customer workflow
- product workflow
- batch workflow
- subscription workflow
- payment workflow
- overdue EMI workflow
- draw/winner visibility

### Priority
P0

---

## Workstream C – Partner Workflow Completion

### Scope
- dashboard
- customers
- subscriptions
- commissions
- collections
- payment-linked navigation

### Priority
P1

---

## Workstream D – Cashier Speed Flow

### Scope
- search pending EMIs
- collect payment
- submit and confirm
- recent transactions visibility

### Priority
P0

---

## Workstream E – Customer Experience Cleanup

### Scope
- dashboard
- subscriptions
- payment history
- profile
- support

### Priority
P2

---

## Workstream F – Route and Service Consolidation

### Scope
- remove legacy duplicates
- normalize services
- align route naming
- ensure correct deep links

### Priority
P0

---

## 10. Execution Priority Plan

## Phase 1 – Business-Critical Frontend Fixes

### Must complete first
- Admin dashboard operational redesign
- Admin subscription workflow completion
- Admin payment workflow completion
- Overdue EMI workflow clarity
- Cashier collection speed flow
- Route cleanup for broken/dead-end admin pages
- Backend-driven truth for payment and commission related pages

### Output of Phase 1
A business-usable admin and cashier environment.

---

## Phase 2 – Admin Workflow Depth and Monitoring

### Scope
- customer detail improvements
- product/batch detail improvements
- draw/winner visibility
- reports overview improvement
- table/filter consistency across admin modules

### Output of Phase 2
A stronger monitoring and control environment for management.

---

## Phase 3 – Partner Workspace Refinement

### Scope
- partner dashboard
- partner subscriptions detail consistency
- collections and commissions flow
- partner customer relationship screens

### Output of Phase 3
A usable field-operations partner portal.

---

## Phase 4 – Customer Portal and Final Polish

### Scope
- customer dashboards and payment visibility
- UI consistency polish
- final responsiveness pass
- empty/error/loading standardization

### Output of Phase 4
A more complete end-user experience and more polished system behavior.

---

## 11. Frontend File-Level Planning Standard For Developer Team

For each actual file the team modifies, they should document changes using this format:

### File
`path/to/file.tsx`

### Reason
What operational problem this file currently has.

### Change type
- UI refinement
- workflow completion
- API alignment
- route cleanup
- status normalization
- form improvement
- table enhancement

### Risk
- no data risk
- low data risk
- requires backend alignment

### Notes
- backward compatibility impact
- future rent/lease compatibility impact

This should be maintained for all major changes so the project remains controlled.

---

## 12. Frontend Acceptance Criteria

The work should be accepted only when all of the following are true:

### Workflow acceptance
- Admin can complete daily workflows without dead ends
- Cashier can collect EMI quickly and safely
- Partner can understand assignments and earnings clearly
- Customer can see subscription and payment position clearly

### UI acceptance
- Major modules use a common page structure
- Status indicators are consistent
- Forms are understandable without developer explanation
- Tables are searchable and filterable where needed

### Technical acceptance
- No route collisions
- No broken links in visible menus
- No role leakage across protected areas
- No frontend-only financial truth replacing backend truth
- Type-safe service usage for major modules

### Business acceptance
- Staff training effort decreases
- Daily navigation burden decreases
- Payment/subscription errors reduce
- Management can monitor activity from dashboard and reports

---

## 13. Risks To Avoid

The developer team must avoid the following mistakes:

- redesigning the entire UI without workflow priorities
- introducing breaking API assumptions
- computing financial truth on frontend when backend already owns it
- adding many visual elements but not improving business usability
- creating separate inconsistent page layouts for each module
- hiding important actions under too many clicks
- removing future compatibility for plan types beyond EMI

---

## 14. Final Delivery Expected From Developer Team

The team should submit the frontend work in the following format:

### A. Audit summary
- what was broken
- what was improved
- what remains pending

### B. File-by-file implementation log
- exact files changed
- exact purpose of each change

### C. Route map
- active routes
- deprecated routes
- redirected routes

### D. API alignment note
- which screens now use correct backend data
- which screens still need backend improvement

### E. Test checklist
- login and role routing
- admin workflows
- cashier collection flow
- partner visibility
- customer visibility
- loading/error/empty states
- responsive behavior

---

## 15. Recommended Immediate Start Order

The developer team should start in this exact order:

1. Admin dashboard
2. Admin subscriptions
3. Admin payments
4. Cashier collection flow
5. Overdue EMI workflow
6. Admin customers
7. Admin products
8. Admin batches
9. Draw/winner visibility
10. Reports overview
11. Partner portal refinements
12. Customer portal refinements
13. Final consistency pass across shared components

---

## 16. Management Summary

This frontend plan is not a visual redesign only. It is an **operational refinement plan**.

The purpose is to convert the existing frontend into a business-usable system where:

- staff can work faster,
- managers can monitor operations clearly,
- payment and subscription flows feel safe,
- navigation becomes predictable,
- and the system remains extensible for future furniture rental/leasing expansion.

The developer team should implement this plan as a controlled additive enhancement, not a rewrite.

---

## 17. Developer-Ready Frontend Task Sheet (Exact Path Based)

This section converts the strategy into executable frontend work packets.

**Important implementation rule:** all changes below are intended as additive, non-breaking refinements based on the current SUBIDHA CORE frontend conventions already discussed for the repo.

Base frontend root assumed:

`/home/subidha-furniture/subidha-lucky-plan/frontend`

---

## Phase 1 – P0 Business-Critical Workflow Completion

### 17.1 Admin dashboard operational redesign

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/features/admin-workflow/dashboard.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/ui/PortalPage.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/ui/PageHeader.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/feedback/LoadingBlock.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/feedback/ErrorState.tsx`

#### Work to perform
- Convert admin landing page into real operations dashboard
- Add KPI strip for active subscriptions, overdue EMIs, today collections, open batches
- Add quick action zone for create subscription, collect payment, view overdue, payments, reports
- Add recent payment and recent winner widgets
- Standardize spacing, loading, error, and empty states
- Ensure action cards link only to real working routes

#### Output expected
A dashboard that reduces navigation burden and highlights what needs action first.

---

### 17.2 Admin subscriptions workflow hardening

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/subscriptions/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/subscriptions/create/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/subscriptions/[id]/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/subscriptions/[id]/edit/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/subscriptions/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/forms/SearchSelect.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/ui/EnterpriseDataTable.tsx`

#### Work to perform
- Improve search/filter by subscription number, customer, phone, batch, lucky number, product, status, partner
- Make create flow stepwise and operator-safe
- Show computed summary before submit: customer, product, batch, lucky number, monthly amount, total amount
- Support auto-assigned Lucky ID flow cleanly
- Improve detail page with summary cards, financial progress, EMI schedule, payment history, customer link, partner link
- Highlight winner state and waived EMI state clearly
- Ensure won subscriptions never appear visually as ordinary pending cases

#### Output expected
The subscription area becomes a contract-control workflow, not just a list page.

---

### 17.3 Admin payments workflow completion

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/payments/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/payments/create/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/payments/[id]/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/payments/reconciliation/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/payments/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/reports/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/lib/api.ts`

#### Work to perform
- Fix and normalize payment list search and filters
- Support query by reference, customer, subscription, phone, method, date range, reversal state
- Ensure create page supports deep-link prefill for subscription and EMI selection
- Show safe validation messages for amount, payment method, and reference number
- Improve success state after payment submission with receipt-style confirmation summary
- Strengthen payment detail page with linked subscription, linked EMI, timeline, reversal visibility, and operational notes
- Reconciliation page should explain mismatches in business terms, not just raw data

#### Output expected
Payments become faster, safer, and easier to verify during daily operation.

---

### 17.4 Overdue EMI operational workflow

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/emis/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/emis/overdue/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/emis/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/ui/EnterpriseDataTable.tsx`

#### Work to perform
- Make overdue page actionable, not just informative
- Add filters for customer, phone, batch, product, partner, days overdue
- Make badges visually distinct for pending, overdue, paid, waived
- Add fast navigation to subscription detail and payment collection pages
- Add totals at top: overdue count, overdue amount, most urgent due groupings

#### Output expected
Staff can identify overdue cases and move to the next action immediately.

---

### 17.5 Cashier collection speed workflow

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/cashier/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/cashier/collect/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/cashier/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/forms/SearchSelect.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/ui/PortalPage.tsx`

#### Work to perform
- Optimize search-by-phone / pending EMI lookup flow
- Reduce clicks from search to collection confirmation
- Show customer and subscription summary above collection form
- Ensure wrong-EMI selection is hard to make
- Add recent collections block for cashier confidence and quick review
- Improve submit success flow with transaction summary

#### Output expected
Cashier can collect EMI in minimal clicks without ambiguity.

---

### 17.6 Route cleanup and navigation stabilization

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/middleware.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/layout/AdminSidebar.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/layout/AdminNavbar.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/layout/DashboardShell.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/lib/routes.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/scripts/check-routes.mjs`

#### Work to perform
- Remove dead, duplicate, or legacy links from visible navigation
- Ensure middleware role-protection matches real route tree
- Normalize dashboard menu grouping by actual workflows
- Verify that login redirects land on correct role home pages
- Ensure no visible menu item leads to a weak or unfinished page without clear status

#### Output expected
Navigation becomes predictable and route safety improves.

---

## Phase 2 – P1 Admin Depth, Monitoring, and Consistency

### 17.7 Admin customers refinement

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/customers/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/customers/create/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/customers/[id]/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/customers/[id]/edit/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/customers/index.ts`

#### Work to perform
- Improve search/filter structure
- Add detail summary card and linked subscriptions/payments overview
- Improve form grouping and validation clarity
- Make customer detail behave like a parent profile screen with strong related sections

---

### 17.8 Admin products refinement

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/products/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/products/create/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/products/[id]/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/products/[id]/edit/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/products/index.ts`

#### Work to perform
- Expose category, subcategory, description, base price, tenure, and EMI preview correctly
- Clarify that base price is total contract price
- Improve list filters and detail summary sections
- Make create/edit form easier for non-technical staff

---

### 17.9 Admin batches refinement

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/batches/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/batches/create/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/batches/[id]/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/batches/[id]/edit/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/batches/index.ts`

#### Work to perform
- Improve occupancy visibility and batch status visibility
- Surface draw day, start date, duration, total slots, open/closed state clearly
- Link batch detail to lucky IDs and subscriptions strongly
- Add safeguards around close-batch related actions in the UI

---

### 17.10 Lucky IDs visibility refinement

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/lucky-ids/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/lucky-ids/index.ts`

#### Work to perform
- Improve status filtering and lucky number formatting
- Emphasize relation to batch/customer/subscription rather than isolated usage
- Add better quick-link behavior to parent records

---

### 17.11 Draw / winner visibility refinement

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/lucky-draw/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/lucky-draw/history/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(public)/winner-history/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/draws/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/public/index.ts`

#### Work to perform
- Surface draw history and recent winner visibility clearly
- Clarify won subscriptions and waived future EMIs visually
- Ensure public/latest-winner and admin winner visibility remain consistent
- Reduce trust issues around draw outcome presentation

---

### 17.12 Reports overview improvement

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/reports/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/reports/revenue/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/reports/overdue/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/admin/reports/batch-performance/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/reports/index.ts`

#### Work to perform
- Make reports landing page useful with grouped report cards and KPI snapshots
- Improve readability and export-readiness of report tables
- Ensure each report answers a real management question quickly

---

## Phase 3 – P1 Partner Workspace Refinement

### 17.13 Partner dashboard and list-detail flow

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/partner/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/partner/customers/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/partner/subscriptions/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/partner/subscriptions/[id]/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/partner/index.ts`

#### Work to perform
- Improve dashboard KPI summary and action entry points
- Strengthen partner customer list and subscription detail flow
- Make linked navigation between customers, subscriptions, collections, and earnings cleaner

---

### 17.14 Partner commissions and collections workflow

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/partner/commissions/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/partner/collections/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/partner/collections/create/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/partner/collections/[id]/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/partner-collections/index.ts`

#### Work to perform
- Make commissions page ledger-driven and readable
- Improve collection request submission flow
- Strengthen collection detail visibility and state messaging
- Ensure partner sees truth from backend, not client-side estimated amounts

---

## Phase 4 – P2 Customer Portal and Final Consistency Pass

### 17.15 Customer dashboard and payments visibility

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/customer/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/customer/subscriptions/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/customer/subscriptions/[id]/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/customer/payments/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/customer/profile/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/(dashboard)/customer/support/page.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/customer/index.ts`

#### Work to perform
- Clarify dashboard summary and next due visibility
- Make payment history directly backend-driven where possible
- Improve subscription detail readability for end users
- Standardize customer empty/error/loading states

---

### 17.16 Shared component consistency pass

#### Primary files
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/ui/PortalPage.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/ui/PageHeader.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/ui/EnterpriseDataTable.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/layout/DashboardShell.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/feedback/LoadingBlock.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/feedback/ErrorState.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/components/auth/RoleGuard.tsx`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/lib/api.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/app/globals.css`

#### Work to perform
- Standardize spacing, section hierarchy, cards, tables, badges, and state handling
- Normalize protected page behavior and token-refresh error handling
- Improve consistency of typography and action placement

---

## 18. Supporting Service Files To Review Across Phases

These files should be reviewed during implementation because most page issues will depend on them:

- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/lib/api.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/internal-users/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/customers/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/products/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/batches/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/lucky-ids/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/subscriptions/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/payments/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/reports/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/cashier/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/partner/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/partner-collections/index.ts`
- `/home/subidha-furniture/subidha-lucky-plan/frontend/src/services/public/index.ts`

---

## 19. File-by-File Task Recording Format For Team

For every modified file, the team should maintain this implementation note:

### Path
Exact full path

### Purpose
Why this file needed change

### Change summary
What was changed in the frontend behavior

### API dependency
What backend endpoint or service contract this relies on

### Risk level
- None
- Low
- Medium

### Compatibility note
How this remains safe for future rent/lease support

---

## 20. Final Developer Submission Required

The team should submit the frontend work package like this:

1. Phase completion summary
2. Exact files changed
3. Screens improved
4. Backend API dependencies used
5. Any blocked pages requiring backend work
6. Validation proof:
   - route validation
   - type check
   - build success
   - manual workflow checklist

---

## 21. Immediate Execution Order For Team Lead

Use this exact work queue:

1. `admin/page.tsx`
2. `admin/subscriptions/*`
3. `admin/payments/*`
4. `cashier/*`
5. `admin/emis/overdue/page.tsx`
6. `middleware.ts` + admin navigation files
7. `admin/customers/*`
8. `admin/products/*`
9. `admin/batches/*`
10. `admin/lucky-draw*`
11. `admin/reports/*`
12. `partner/*`
13. `customer/*`
14. shared components and final consistency pass

This order should be followed unless a backend contract defect blocks one of the above items.

