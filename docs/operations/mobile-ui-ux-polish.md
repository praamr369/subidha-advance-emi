# Mobile UI UX Polish

## Required Responsive Behavior
- `MetricStrip` wraps to compact multi-row layout on mobile.
- Queue rows stack vertically with readable count/value alignment.
- Ledger rows preserve label/value readability at 360px and 390px widths.
- No body-level horizontal overflow on 390px.
- Buttons remain touch-friendly (`>=40px` height where possible).

## Target Breakpoints
- 360px
- 390px
- 768px
- 1024px
- 1366px

## Admin Dashboard Guidance
- Keep top strip dense, not oversized.
- Use queue and ledger sections with clear separators.
- Preserve status chip readability and avoid clipped labels.
# Mobile UI/UX Polish

## Scope
Production-readiness polish for dashboard shell, sidebar navigation, notifications, and operational pages.

## Mobile Sidebar Rules
- Sidebar opens as a drawer.
- Drawer has close button and overlay close.
- Sidebar closes on route navigation.
- Grouped navigation remains role-safe.
- Search remains available in drawer.
- Footer profile/logout actions are reachable on small screens.

## Overlay and Layering
- Notifications and popovers must render above cards.
- Dialogs/drawers render above sidebar and topbar layers.
- Long dialog content must scroll internally.
- No hover-only critical action on touch devices.
- Overlay convention:
  - popup portal root above app chrome
  - dropdown/popover layer below modal/sheet layer
  - command palette above standard modal layer

## Responsive Safety
- Avoid horizontal overflow for shell and content wrappers.
- Preserve readable actions/labels at 360px and 390px.
- Keep tablet/desktop parity at 768px, 1024px, and 1366px.
- Tables must use safe horizontal scroll wrappers or mobile card alternatives.
- Sticky action bars in drawers/modals must remain reachable on small screens.
- Reversed/archived/history-only rows must render as non-actionable with history/document links only.

## Form and Modal Policy
- Prefer single-column form layout on mobile.
- Keep labels and field-level validation visible.
- Disable submit while mutation is in-flight.
- Keep close/cancel controls visible even for long form content.

## No Fake Data
- Use live API data only.
- Empty/unavailable states must be explicit and clean.
