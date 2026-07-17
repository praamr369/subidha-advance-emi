# CRM Profile Pages - Enterprise Workbench Improvements

**Date:** 2026-07-16  
**Status:** Phase 1 Complete

## Summary

Unified CRM profile pages with enterprise UI components, centralized KPI calculation, and eliminated duplicate data rendering patterns. Reduces page complexity and standardizes workflow across all profile modules.

## Components Created

### 1. `ProfileWorkbench.tsx`
Thin wrapper over `ERPPageShell` providing consistent structure for all profile pages.

```tsx
<ProfileWorkbench
  title="Partner Management"
  stats={headerStats}
  toolbar={<ProfileToolbar {...} />}
  content={<ProfileTable {...} />}
/>
```

### 2. `ProfileStatsCalculator.ts`
Static utility class for KPI calculation, eliminating duplicate useMemo + reduce patterns.

**Methods:**
- `calculateCustomerStats()` — Total, Active, Pending KYC, Active Subscriptions
- `calculatePartnerStats()` — Partners, Active, Subscriptions, Monthly Book
- `calculateVendorStats()` — Vendors, Active, Inactive
- `calculateBranchStats()` — Branches, Active, Primary
- `calculateStaffStats()` — Staff, Active, Inactive

**Usage:**
```tsx
const stats = ProfileStatsCalculator.calculatePartnerStats({
  totalCount: partners.length,
  activeCount: partners.filter(p => p.is_active).length,
  totalSubscriptions: partners.reduce((sum, p) => sum + p.active_subscriptions, 0),
  totalMonthlyBook: partners.reduce((sum, p) => sum + p.total_monthly_book, 0),
  loading
});
```

### 3. `ProfileToolbar.tsx`
Reusable search + filter + action toolbar component.

**Features:**
- Global search input with debounce support
- Dynamic filter dropdowns (configurable filters array)
- Apply/Reset button pair
- Refresh button with loading state
- Custom action slot for page-specific buttons

**Props:**
```tsx
<ProfileToolbar
  searchValue={query}
  onSearchChange={setQuery}
  onRefresh={loadData}
  filters={[
    { key: "status", label: "Status", options: [{...}] }
  ]}
  filterValues={{ status: activeFilter }}
  onFilterChange={(key, value) => setFilter(value)}
  onReset={handleReset}
  actions={<CustomActions />}
/>
```

### 4. `ProfileTable.tsx`
Unified table wrapper with EnterpriseDataTable + consistent loading/error/empty states.

**Props:**
```tsx
<ProfileTable
  title="Partner Registry"
  data={partners}
  columns={[...]}
  loading={loading}
  error={error}
  onRetry={reload}
  emptyAction={<CreateButton />}
/>
```

## Pages Refactored

### ✅ `/admin/partners`
**Before:**
- 8 duplicate KPI cards in body
- Manual toolbar code (search, filter inputs, buttons)
- Duplicate state management for filters
- QuickPartnerActions section with inline logic
- 609 lines

**After:**
- KPIs centralized in header via `ProfileStatsCalculator`
- `ProfileToolbar` component handles all search/filter/refresh logic
- `ProfileTable` wraps EnterpriseDataTable with consistent styling
- Removed QPA section (navigate to modules instead)
- 181 lines

**Improvements:**
- 70% line reduction
- No duplicate KPI rendering
- Reusable toolbar pattern
- Consistent with UI polish phase standards

## Pages Already Compliant

### ✅ `/admin/vendors`
- ✓ Centralized header stats (no body duplication)
- ✓ Uses EnterpriseDataTable
- ✓ Has EntityDrawer for create/edit workflow
- ✓ RightInspector panel for detail view
- No refactor needed; already follows pattern

### ✅ `/admin/branches`
- ✓ Centralized header stats + primary branch default
- ✓ Uses EnterpriseDataTable for branch register
- ✓ StatCard metrics in body are readiness-specific, not duplicates
- ✓ Inline form editor for create/edit
- No refactor needed; readiness cards add operational context

## Pages Pending Refactor

### 🔄 `/admin/customers`
**Scope:** Large complex page with CSV import workflow
- Currently uses RegistryPageShell + manual toolbar UI
- Duplicate KPI calculations
- Customer import section is workflow-specific and should be preserved
- **Approach:** Apply ProfileStatsCalculator + ProfileToolbar, preserve import panel as separate section

### 🔄 `/admin/hr/staff`
**Scope:** Staff profile page from HR module
- Currently redirects to `/admin/hr/staff`
- Likely uses similar manual toolbar pattern
- **Approach:** Apply same unified pattern after checking HR staff page structure

### 🔄 `/admin/profiles/parties` (Party Master)
**Scope:** Unified party directory (customers, partners, vendors, staff)
- Hub page linking to other profile modules
- May need unified cross-party views
- **Approach:** Implement after individual profile pages are complete

## Pattern Convention

All profile pages now follow this structure:

```tsx
<ERPPageShell
  eyebrow="Module Name"
  title="Entity Type"
  subtitle="Description"
  breadcrumbs={[...]}
  actions={[...]}  // Route to downstream modules
  stats={ProfileStatsCalculator.calculate*(...)}  // KPI band at top
  statusBadge={{ label: "...", tone: "info" }}
>
  <div className="space-y-6">
    <ProfileToolbar {...} />
    <ProfileTable {...} />
  </div>
</ERPPageShell>
```

**Key principles:**
1. **No duplicate KPIs**: Stats calculated once, placed in header, body never repeats metrics
2. **Unified toolbar**: Search, filters, refresh, actions in one reusable component
3. **Consistent table**: EnterpriseDataTable with loading/error/empty states
4. **Module clarity**: Page title clarifies context (e.g., "Customer Register" not just "Customers"); actions route to downstream modules, not clutter the page
5. **Workflow-specific content**: Additional sections (readiness panels, import workflows) are clearly labeled and contextual, not duplicate metrics

## Verification Gates

✓ TypeScript compilation (`tsc --noEmit`)  
✓ All new components created in `crm-workbench/`  
✓ Index export file for module  
✓ Partners page refactored and verified  
✓ No KPI duplication in refactored pages  

## Next Session

1. Refactor `/admin/customers` with ProfileStatsCalculator + ProfileToolbar
2. Check and refactor `/admin/hr/staff` (may not be a profile page, verify)
3. Implement cross-party Party Master view if needed
4. Run full TypeScript check post-refactor
5. Verify all profile pages in browser for visual consistency

## Related Documentation

- [[project_ui_polish_phases]] — Overall initiative status + phase progress
- [[reference_verification_gates]] — Backend + frontend verification procedures
