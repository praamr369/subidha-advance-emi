# Sidebar Mobile Navigation

## Role-Safe Grouping
Navigation is centralized and grouped by role:
- Admin: command-center and operational domain groups.
- Cashier: collection-focused groups only.
- Customer: self-service only.
- Partner: partner-owned customer/commission workflows only.
- Vendor: vendor portal operations only.

## Behavior
- Drawer mode on mobile.
- Close control and overlay dismiss.
- Close on route click.
- Search/filter available.
- Group expand/collapse preserved.
- Footer profile/logout controls must remain reachable without clipping.
- No body-level horizontal overflow at mobile breakpoints.

## Access Boundaries
- Never expose admin-only routes to cashier/customer/partner/vendor.
- Vendor and partner sidebars show only role-safe routes.

## Badge Policy
- Badge counts come from real backend badge endpoints only.
- If unavailable, omit badge instead of fabricating counts.
