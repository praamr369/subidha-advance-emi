# UI/UX Polish Guidelines

This guideline defines the production UI behavior for SUBIDHA CORE dashboards, registers, and workflows.

## Layout Contract

- Every workspace page should use `PortalPage` with:
  - clear title
  - operational subtitle
  - primary action
  - supporting actions
  - optional KPI cards
- Prefer one page-level primary action per workflow.
- Use shared wrappers (`WorkspaceSection`, `PageSection`) for consistent spacing.

## Readability and Copy

- Avoid raw technical wording in default operator flows.
- Use business language: Advance EMI, Direct Sale, Return, Exchange, Refund, Reversal, Outstanding, Lucky Draw.
- Hide raw source identifiers in normal mode when a business reference is not available.
- Convert raw API validation failures into readable action guidance.

## Action Safety

- Keep destructive actions isolated from non-destructive actions.
- Require confirm + reason for void/cancel/archive actions.
- Keep reversal and return warning copy explicit and additive.
- Role guardrails must remain strict: no admin-only controls on customer/partner/cashier/vendor dashboards.

## States and Feedback

- All key pages should handle:
  - loading
  - error
  - empty
  - filtered-empty
- Use skeleton/loading blocks for summary cards and table-heavy routes.
- Do not show duplicate toasts for one action.

## Table and Register Rules

- Include search, filter, status, and row actions on operational registers.
- Keep amount/date/status columns consistent and readable.
- Status should use shared badges for ACTIVE, PENDING, OVERDUE, PAID, VOID, REVERSED, CANCELLED, ARCHIVED, RETURNED, FROZEN, LOCKED, POSTED.

## Sidebar and Navigation

- Navigation remains role-aware and centralized in config.
- Collapsed navigation flyouts must be keyboard reachable and mobile-safe.
- Critical workflows should be available as clickable links, not hover-only affordances.

## Responsiveness and Accessibility

- Minimum viewport checks: desktop, tablet, and mobile drawer.
- Ensure keyboard focus visibility on nav controls and action buttons.
- Inputs need labels and actionable field error messages.
