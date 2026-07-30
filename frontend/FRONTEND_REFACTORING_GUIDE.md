# Frontend P0/P1 Refactoring Guide
**Unified Workbench Pattern for 14 Pages**

**Status:** Ready for Implementation  
**Created:** 2026-07-16  
**Scope:** 9 CRM pages + 5 Requests pages

---

## Overview

This guide shows exactly how to refactor all 14 pages using the proven unified pattern. All pages will:
- Use ERPPageShell with stats band in header
- Calculate stats once (no duplication)
- Have consistent toolbar (search, filter, refresh)
- Have paginated table with unified error/loading states
- Preserve domain-specific workflows (forms, modals, etc.)

**Expected Outcomes:**
- 50% code reduction (avg 6,000 → 3,000 lines)
- Consistent UX across all pages
- Better performance (no duplicate calculations)
- Reusable components for future pages

---

## Architecture Pattern

```
Page Component
├── State (rows, loading, error, filter values, pagination)
├── API Calls (fetch data with pagination + filters)
├── Stats Calculation (via CrmStatsCalculator / RequestsStatsCalculator)
├── Render
│   ├── ERPPageShell
│   │   ├── stats={headerStats}           ← Stats band (no duplicates)
│   │   └── ProfileToolbar                ← Search + Filter + Refresh
│   │   └── ProfileTable                  ← Paginated data table
│   │   └── Additional Sections           ← Domain-specific workflows
│   └── Modals/Forms                      ← Preserved workflows
```

---

## Common Component API Reference

### ERPPageShell Props
```tsx
<ERPPageShell
  eyebrow="CRM"
  title="CRM Leads"
  subtitle="Internal lead pipeline and online enquiry inbox."
  breadcrumbs={[...]}
  stats={headerStats}      // ← StatDefinition[] array
  actions={[...]}          // Optional action buttons
>
  {/* Content */}
</ERPPageShell>
```

### ProfileToolbar Props
```tsx
<ProfileToolbar
  searchValue={search}
  onSearchChange={setSearch}
  onRefresh={handleRefresh}
  filters={[
    { key: 'status', label: 'Status', options: [...] },
    { key: 'date', label: 'Date Range', options: [...] }
  ]}
  filterValues={filterValues}
  onFilterChange={(key, value) => setFilterValues({...})}
  onApply={handleApplyFilters}
  onReset={handleResetFilters}
/>
```

### ProfileTable Props
```tsx
<ProfileTable
  title="All Leads"
  data={rows}
  columns={[...]}          // Column definitions
  loading={loading}
  error={error}
  onRetry={handleRetry}
  emptyAction={{
    label: "Add New Lead",
    onClick: handleAddLead
  }}
/>
```

### StatDefinition Type
```tsx
interface StatDefinition {
  label: string;           // "Total Leads"
  value: string | number;  // "125"
  tone?: "info" | "success" | "warning" | "default";
}
```

---

## Refactoring Template: CRM Leads Page

### Step 1: Review Current Structure
```tsx
// frontend/src/app/(dashboard)/admin/crm/leads/page.tsx
// Current: ~400 lines with:
// - Inline KPI cards (duplicated stats)
// - Manual toolbar with inputs
// - Inline table with loading states
```

### Step 2: Extract Constants
```tsx
// Move to top of file
const STAGE_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'INTERESTED', label: 'Interested' },
  // ...
];

const COLUMNS = [
  { accessor: 'id', header: 'ID', width: 80 },
  { accessor: 'name', header: 'Name' },
  { accessor: 'phone', header: 'Phone' },
  { accessor: 'stage', header: 'Stage', cell: (val) => STAGE_BADGE[val] },
  // ...
];
```

### Step 3: Simplify State
```tsx
// Before: 15+ useState() calls
const [rows, setRows] = useState<Lead[]>([]);
const [totalCount, setTotalCount] = useState(0);
const [totalPages, setTotalPages] = useState(1);
const [page, setPage] = useState(1);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [search, setSearch] = useState("");
const [filterStage, setFilterStage] = useState("");

// After: Same structure, but keep it organized
```

### Step 4: Calculate Stats Once
```tsx
import { CrmStatsCalculator } from "@/components/crm-workbench";

const headerStats = useMemo(() => {
  const stageCounts = rows.reduce((acc, row) => {
    acc[row.stage] = (acc[row.stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return CrmStatsCalculator.calculateLeadsStats({
    totalCount,
    newCount: stageCounts['NEW'] || 0,
    convertedCount: stageCounts['CONVERTED'] || 0,
    lostCount: stageCounts['LOST'] || 0,
    loading
  });
}, [totalCount, rows, loading]);
```

### Step 5: Replace Render with Unified Components
```tsx
return (
  <ERPPageShell
    eyebrow="CRM"
    title="CRM Leads"
    subtitle="Internal lead pipeline and online enquiry inbox."
    breadcrumbs={[...]}
    stats={headerStats}
  >
    <div className="space-y-6">
      {/* Toolbar: Search + Filter + Refresh */}
      <ProfileToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onRefresh={() => load()}
        filters={[
          {
            key: 'stage',
            label: 'Stage',
            options: STAGE_OPTIONS
          }
        ]}
        filterValues={{ stage: filterStage }}
        onFilterChange={(key, value) => setFilterStage(value)}
        onApply={() => setPage(1)}
        onReset={() => {
          setSearch("");
          setFilterStage("");
        }}
      />

      {/* Table: Data + Pagination + States */}
      <ProfileTable
        title="Lead Pipeline"
        data={rows}
        columns={COLUMNS}
        loading={loading}
        error={error}
        onRetry={load}
        emptyAction={{
          label: "Create Lead",
          onClick: () => setShowAddForm(true)
        }}
      />

      {/* Pagination Controls */}
      <Pagination
        current={page}
        total={totalPages}
        onChange={setPage}
      />

      {/* Domain-specific workflow: Add Lead Form */}
      {showAddForm && (
        <AddLeadModal
          onClose={() => setShowAddForm(false)}
          onSubmit={handleAdd}
        />
      )}
    </div>
  </ERPPageShell>
);
```

---

## Page-by-Page Refactoring Map

### CRM Pages (9 pages)

#### 1. CRM Hub Page
**File:** `frontend/src/app/(dashboard)/admin/crm/page.tsx`  
**Refactor Level:** Light  
**What to Do:**
- Extract stats band from CrmStatsCalculator
- Use ERPPageShell to show high-level stats
- Add quick-action buttons for common workflows

```tsx
const headerStats = useMemo(() => {
  return CrmStatsCalculator.calculateLeadsStats({
    totalCount: partyCount.total,
    newCount: partyCount.new,
    convertedCount: partyCount.converted,
    lostCount: partyCount.lost,
    loading: partiesLoading
  });
}, [partyCount, partiesLoading]);

return (
  <ERPPageShell stats={headerStats} ... >
    {/* Grid of module cards below stats */}
  </ERPPageShell>
);
```

**Lines:** 50-80 (from ~150)

#### 2. CRM Leads Register
**File:** `frontend/src/app/(dashboard)/admin/crm/leads/page.tsx`  
**Refactor Level:** Full  
**What to Do:**
- Apply template above verbatim
- Preserve online enquiry tab (separate section)
- Remove duplicate KPI cards
- Use ProfileToolbar + ProfileTable for both tabs

**Before:** 609 lines  
**After:** ~200 lines  
**Reduction:** 67%

#### 3. CRM Pipeline
**File:** `frontend/src/app/(dashboard)/admin/crm/pipeline/page.tsx`  
**Refactor Level:** Medium  
**What to Do:**
- Stats band: total, interested, ready_to_convert, kyc_pending
- Use ProfileToolbar for stage filtering
- Preserve funnel visualization below table (domain-specific)
- Add ProfileTable for list view

```tsx
const headerStats = useMemo(() => {
  return CrmStatsCalculator.calculatePipelineStats({
    totalCount: leads.length,
    interestedCount: interested.length,
    readyToConvertCount: ready.length,
    kycPendingCount: kycPending.length,
    loading
  });
}, [leads, loading]);
```

**Lines:** ~250 (from ~400)

#### 4. CRM Follow-Ups
**File:** `frontend/src/app/(dashboard)/admin/crm/follow-ups/page.tsx`  
**Refactor Level:** Full  
**What to Do:**
- Stats: total, due_today, overdue, completed
- ProfileToolbar with date range filters
- ProfileTable showing overdue first
- Preserve "mark complete" bulk action

**Before:** 350 lines  
**After:** ~120 lines  
**Reduction:** 66%

#### 5. CRM KYC
**File:** `frontend/src/app/(dashboard)/admin/crm/kyc/page.tsx`  
**Refactor Level:** Full  
**What to Do:**
- Stats: total, pending, verified, expired
- ProfileToolbar with status filter
- ProfileTable with verification link in each row
- Preserve KYC approval modal

**Before:** 280 lines  
**After:** ~100 lines  
**Reduction:** 64%

#### 6. CRM KYC Reverification Queue
**File:** `frontend/src/app/(dashboard)/admin/crm/kyc/reverification-queue/page.tsx`  
**Refactor Level:** Medium  
**What to Do:**
- Subset of KYC page
- Stats: total_requiring_reverification, in_progress, completed
- Filter to only show expired KYCs
- Use same KYC table with reverification action

**Lines:** ~80 (from ~150)

#### 7. CRM KYC Expiry Notifications
**File:** `frontend/src/app/(dashboard)/admin/crm/kyc/expiry-notifications/page.tsx`  
**Refactor Level:** Medium  
**What to Do:**
- Stats: total_expiring, expiring_this_week, expiring_this_month
- Toolbar with date range (pre-select next 30 days)
- Table showing expiry dates
- Preserve "send notification" bulk action

**Lines:** ~90 (from ~140)

#### 8. CRM AML
**File:** `frontend/src/app/(dashboard)/admin/crm/aml/page.tsx`  
**Refactor Level:** Full  
**What to Do:**
- Stats: total_flagged_customers, flagged, reviewed, cleared
- ProfileToolbar with status filter (FLAGGED, REVIEWED, CLEARED)
- ProfileTable with flag details
- Preserve "resolve flag" modal

**Before:** 320 lines  
**After:** ~110 lines  
**Reduction:** 66%

#### 9. CRM Disputes
**File:** `frontend/src/app/(dashboard)/admin/crm/disputes/page.tsx`  
**Refactor Level:** Full  
**What to Do:**
- Stats: total, open, pending_review, resolved
- ProfileToolbar with status filter
- ProfileTable with resolution action
- Preserve dispute detail modal

**Before:** 300 lines  
**After:** ~100 lines  
**Reduction:** 67%

---

### Requests Pages (5 pages)

#### 10. Requests Hub
**File:** `frontend/src/app/(dashboard)/admin/requests/page.tsx`  
**Refactor Level:** Light  
**What to Do:**
- Extract stats from RequestsStatsCalculator
- Show quick stats for all 4 request types
- Link to detail pages

**Lines:** ~60 (from ~100)

#### 11. Online Enquiries
**File:** `frontend/src/app/(dashboard)/admin/requests/online-enquiries/page.tsx`  
**Refactor Level:** Full  
**What to Do:**
- Stats: total, new, in_progress, closed
- Use ProfileToolbar + ProfileTable pattern
- Preserve "promote to CRM" workflow

**Before:** 350 lines  
**After:** ~130 lines  
**Reduction:** 63%

#### 12. Support Requests
**File:** `frontend/src/app/(dashboard)/admin/requests/support/page.tsx`  
**Refactor Level:** Full  
**What to Do:**
- Stats: total, open, in_progress, resolved
- ProfileToolbar with assignment filter
- ProfileTable with support actions
- Preserve ticket detail view

**Before:** 280 lines  
**After:** ~100 lines  
**Reduction:** 64%

#### 13. Subscription Requests
**File:** `frontend/src/app/(dashboard)/admin/requests/subscriptions/page.tsx`  
**Refactor Level:** Full  
**What to Do:**
- Stats: total, pending_approval, approved, rejected
- ProfileToolbar with approval filter
- ProfileTable with approval action
- Preserve approval workflow modal

**Before:** 320 lines  
**After:** ~120 lines  
**Reduction:** 63%

#### 14. Partner Payment Requests
**File:** `frontend/src/app/(dashboard)/admin/partner-payment-requests/page.tsx`  
**Refactor Level:** Full  
**What to Do:**
- Stats: total, pending, approved, paid
- ProfileToolbar with status filter
- ProfileTable with payment tracking
- Preserve payment release workflow

**Before:** 350 lines  
**After:** ~130 lines  
**Reduction:** 63%

---

## Implementation Roadmap

### Phase 1: Setup (2 hours)
- [ ] Verify all components imported correctly
- [ ] Create COLUMNS constants for each page
- [ ] Create filter OPTIONS for each page
- [ ] Test: npm run build (0 errors)

### Phase 2: CRM Pages (Day 1-2, 8 hours)
- [ ] CRM Hub (30 min)
- [ ] CRM Leads (1 hour)
- [ ] CRM Pipeline (1 hour)
- [ ] CRM Follow-Ups (45 min)
- [ ] CRM KYC (45 min)
- [ ] CRM KYC Reverification (45 min)
- [ ] CRM KYC Expiry (45 min)
- [ ] CRM AML (45 min)
- [ ] CRM Disputes (45 min)

### Phase 3: Requests Pages (Day 2, 4 hours)
- [ ] Requests Hub (30 min)
- [ ] Online Enquiries (1 hour)
- [ ] Support Requests (45 min)
- [ ] Subscription Requests (45 min)
- [ ] Partner Payment Requests (1 hour)

### Phase 4: Testing (4 hours)
- [ ] TypeScript: `npx tsc --noEmit` (0 errors)
- [ ] Manual test each page:
  - [ ] Load works
  - [ ] Search works
  - [ ] Filters work
  - [ ] Pagination works
  - [ ] Stats update
  - [ ] Workflows preserved
- [ ] Performance: Check browser DevTools (< 2s load)
- [ ] Responsive: Test mobile, tablet, desktop

---

## Verification Checklist for Each Page

After refactoring **each page**, verify:

- [ ] **TypeScript compiles:** `npx tsc --noEmit` shows 0 errors for this file
- [ ] **Page loads:** Browser shows content (no errors in console)
- [ ] **Stats display:** Header shows stats band with correct numbers
- [ ] **Search works:** Typing in search updates results
- [ ] **Filters work:** Changing filter updates results
- [ ] **Refresh works:** Refresh button reloads data
- [ ] **Pagination works:** Can navigate between pages
- [ ] **Loading state:** Shows spinner while loading
- [ ] **Error state:** Shows error message if API fails
- [ ] **Empty state:** Shows empty message with action button
- [ ] **Workflows preserved:** Domain-specific forms/modals still work
- [ ] **Responsive:** Mobile view looks good

**Quick Test Command:**
```bash
# Run type checker on specific file
npx tsc --noEmit frontend/src/app/\(dashboard\)/admin/crm/leads/page.tsx
```

---

## Common Gotchas & Solutions

### Issue 1: Stats Calculation Out of Sync
**Problem:** Stats show different numbers than table rows  
**Solution:** Calculate stats from same data source
```tsx
// ❌ Wrong - calculates from different data
const apiStats = await fetch('/stats/');
const tableData = await fetch('/leads/');

// ✅ Correct - calculates from visible data
const headerStats = useMemo(() => {
  return CrmStatsCalculator.calculateLeadsStats({
    totalCount,
    newCount: rows.filter(r => r.stage === 'NEW').length,
    // ... from same rows array
  });
}, [rows, totalCount]);
```

### Issue 2: Duplicate Components
**Problem:** ProfileToolbar + old toolbar both showing  
**Solution:** Remove old toolbar completely
```tsx
// Find and DELETE all of these:
- <div className="flex gap-2 mb-4">
- <Input placeholder="Search..." />
- <Select options={stageOptions} />
- <Button onClick={refresh}>Refresh</Button>

// They're replaced by ProfileToolbar
```

### Issue 3: Missing Imports
**Problem:** Components not found  
**Solution:** Verify import path
```tsx
// ✅ Correct path
import { 
  ProfileToolbar, 
  ProfileTable, 
  CrmStatsCalculator 
} from "@/components/crm-workbench";
```

### Issue 4: Pagination Reset Needed
**Problem:** User filters, sees page 2, but only 5 results  
**Solution:** Reset to page 1 when filter changes
```tsx
const handleFilterChange = (key, value) => {
  setFilterValues(prev => ({ ...prev, [key]: value }));
  setPage(1);  // ← Reset to first page
};
```

---

## Code Size Comparison

| Page | Before | After | Reduction |
|------|--------|-------|-----------|
| CRM Hub | 150 | 80 | 47% |
| CRM Leads | 609 | 200 | 67% |
| CRM Pipeline | 400 | 150 | 63% |
| CRM Follow-Ups | 350 | 120 | 66% |
| CRM KYC | 280 | 100 | 64% |
| CRM KYC Reverification | 150 | 80 | 47% |
| CRM KYC Expiry | 140 | 90 | 36% |
| CRM AML | 320 | 110 | 66% |
| CRM Disputes | 300 | 100 | 67% |
| Requests Hub | 100 | 60 | 40% |
| Online Enquiries | 350 | 130 | 63% |
| Support Requests | 280 | 100 | 64% |
| Subscription Requests | 320 | 120 | 63% |
| Partner Payments | 350 | 130 | 63% |
| **TOTAL** | **~5,000** | **~1,570** | **69%** |

**Average Reduction: ~60% code saved**

---

## What NOT to Change

✅ **Keep these:**
- Page title/subtitle/breadcrumbs
- Domain-specific workflows (forms, modals, dialogs)
- Special logic (conversions, promotions, etc.)
- API data structure

❌ **Remove these:**
- Duplicate KPI cards in body
- Inline toolbar (use ProfileToolbar)
- Inline loading/error states (use ProfileTable)
- Inline table styling (use ProfileTable)

---

## Next Steps

1. **Today:** Implement Phase 1 (Setup) + Phase 2 (CRM Pages)
2. **Tomorrow:** Implement Phase 3 (Requests Pages)
3. **Review:** Verify all 14 pages with checklist
4. **Test:** Full end-to-end testing
5. **Deploy:** Stage → Production

See `P0_P1_P2_IMPLEMENTATION_STATUS.md` for overall roadmap.
