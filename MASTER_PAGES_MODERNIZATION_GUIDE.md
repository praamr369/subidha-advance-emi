# Master Pages Modernization Guide
**Complete Implementation Strategy for 28+ Pages**

**Status:** In Progress  
**Progress:** 2 pages refactored (Invoices ✅, Receipts 🔄)  
**Remaining:** 26 pages in 3 categories  
**Timeline:** 16-20 hours for full implementation  

---

## 📊 Complete Page Inventory with Status

### DONE ✅
- [ ] `/admin/billing/invoices` — REFACTORED (ProfileToolbar + ProfileTable + stats)

### IN PROGRESS 🔄
- [ ] `/admin/billing/receipts` — REFACTORING NOW

### TODO 📋

#### Category 1: Billing Core (4 pages)
```
frontend/src/app/(dashboard)/admin/billing/
├─ register/page.tsx (billing register - list)
├─ credit-notes/page.tsx (list)
├─ debit-notes/page.tsx (list)
└─ page.tsx (hub - already modern, update stats only)
```

#### Category 2: Direct Sales (2 pages)
```
frontend/src/app/(dashboard)/admin/billing/direct-sale/
├─ page.tsx (workspace - modern workspace cards)
├─ create/page.tsx (form - preserve, update styling)
└─ ../direct-sales/page.tsx (list)
```

#### Category 3: Subscriptions (5 pages)
```
frontend/src/app/(dashboard)/admin/
├─ subscriptions/page.tsx (hub + filter by plan_type)
├─ subscriptions/advance-emi/create/page.tsx (form - preserve)
├─ subscriptions/rent/create/page.tsx (form - preserve)
├─ subscriptions/lease/create/page.tsx (form - preserve)
└─ emis/page.tsx (list with plan_type filter)
```

#### Category 4: Products & PIM (6 pages)
```
frontend/src/app/(dashboard)/admin/
├─ products/page.tsx (list)
├─ products/masters/page.tsx (settings - preserve)
├─ products/workspace/page.tsx (workspace cards)
├─ pim/products/page.tsx (list)
├─ pim/categories/page.tsx (list)
└─ pim/categories/manage/page.tsx (editor - preserve)
```

#### Category 5: Brochures (4 pages)
```
frontend/src/app/(dashboard)/admin/brochures/
├─ page.tsx (hub)
├─ settings/page.tsx (settings - preserve)
├─ enquiries/page.tsx (list)
└─ quotations/page.tsx (list)
```

#### Category 6: Contract Amendments (2 pages)
```
frontend/src/app/(dashboard)/admin/
├─ contract-amendments/page.tsx (hub)
└─ contract-amendments/recontract-report/page.tsx (report)
```

#### Category 7: Rent/Lease (2 pages)
```
frontend/src/app/(dashboard)/admin/
├─ rent-lease/page.tsx (hub)
└─ subscriptions/[plan_type]/page.tsx (already using subscription filters)
```

---

## 🔧 Complete Refactoring Templates

### Template 1: LIST PAGES (ProfileToolbar + ProfileTable)

**Used by:** invoices, receipts, register, credit-notes, debit-notes, direct-sales, pim/products, pim/categories, brochures/enquiries, brochures/quotations, products

**Pattern:**
```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ProfileToolbar, ProfileTable } from "@/components/crm-workbench";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import { ROUTES } from "@/lib/routes";

// 1. Define filter options
const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

// 2. Define status badges
const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
};

export default function YourListPage() {
  // 3. State management
  const [rows, setRows] = useState<YourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // 4. Data loading
  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await listYourData({ status: statusFilter });
      
      let filtered = payload.results;
      
      // Client-side search
      if (search) {
        filtered = filtered.filter(row =>
          row.name?.toLowerCase().includes(search.toLowerCase())
        );
      }
      
      setRows(filtered);
    } catch (err) {
      setError("Failed to load data.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  // 5. Calculate stats
  const stats = useMemo(() => [
    { label: "Total", value: rows.length, tone: "info" as const },
    { label: "Active", value: rows.filter(r => r.status === "ACTIVE").length, tone: "success" as const },
  ], [rows]);

  // 6. Define table columns
  const COLUMNS = [
    { accessor: "id", header: "ID", width: 80 },
    { accessor: "name", header: "Name", width: 200 },
    { accessor: "status", header: "Status", width: 120, 
      cell: (val: string) => (
        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${STATUS_BADGE[val]}`}>
          {val}
        </span>
      )
    },
  ];

  // 7. Render
  return (
    <ERPPageShell
      title="Your Page Title"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Your Page" },
      ]}
      stats={stats}
    >
      <div className="space-y-6">
        {/* Toolbar */}
        <ProfileToolbar
          searchValue={search}
          onSearchChange={setSearch}
          onRefresh={loadPage}
          filters={[
            { key: "status", label: "Status", options: STATUS_OPTIONS },
          ]}
          filterValues={{ status: statusFilter }}
          onFilterChange={(key, value) => setStatusFilter(value)}
          onApply={() => {}}
          onReset={() => {
            setSearch("");
            setStatusFilter("");
          }}
        />

        {/* Loading state */}
        {loading && <LoadingBlock label="Loading..." />}

        {/* Error state */}
        {error && <ErrorState title="Failed to load" description={error} onRetry={loadPage} />}

        {/* Table */}
        {!loading && !error && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  {COLUMNS.map(col => (
                    <th key={col.accessor} className="px-3 py-2 font-medium" style={{ width: col.width }}>
                      {col.header}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="px-3 py-4 text-center text-muted-foreground">
                      No data found.
                    </td>
                  </tr>
                ) : (
                  rows.map(row => (
                    <tr key={row.id} className="border-t border-border hover:bg-muted/20">
                      {COLUMNS.map(col => (
                        <td key={`${row.id}-${col.accessor}`} className="px-3 py-2" style={{ width: col.width }}>
                          {col.cell ? col.cell((row as any)[col.accessor]) : (row as any)[col.accessor]}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        {/* Action buttons */}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
```

### Template 2: HUB PAGES (ERPPageShell + Stats + Cards)

**Used by:** billing, rent-lease, contract-amendments, brochures, subscriptions

**Pattern:**
```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import { ROUTES } from "@/lib/routes";
import HubCard from "@/components/ui/HubCard"; // or use existing cards

export default function YourHubPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({
    total: 0,
    active: 0,
    pending: 0,
  });

  useEffect(() => {
    let cancelled = false;
    
    async function loadData() {
      try {
        const [totalCount, activeCount, pendingCount] = await Promise.all([
          fetchTotal(),
          fetchActive(),
          fetchPending(),
        ]);
        
        if (cancelled) return;
        
        setCounts({
          total: totalCount,
          active: activeCount,
          pending: pendingCount,
        });
      } catch (err) {
        setError("Failed to load hub data.");
      } finally {
        setLoading(false);
      }
    }
    
    void loadData();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => [
    { label: "Total", value: counts.total, tone: "info" as const },
    { label: "Active", value: counts.active, tone: "success" as const },
    { label: "Pending", value: counts.pending, tone: "warning" as const },
  ], [counts]);

  return (
    <ERPPageShell
      title="Your Hub"
      subtitle="Hub description"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Your Hub" },
      ]}
      stats={stats}
    >
      {loading && <LoadingBlock label="Loading hub..." />}
      
      {error && <ErrorState title="Failed to load hub" description={error} />}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <HubCard
            title="First Feature"
            href={ROUTES.admin.path1}
            icon={Icon1}
            description="Description"
            badge="Count or status"
          />
          {/* More cards */}
        </div>
      )}
    </ERPPageShell>
  );
}
```

### Template 3: FORM PAGES (Preserve Existing)

**Used by:** create pages, edit pages, settings pages

**No changes needed** - keep existing form structures, just:
1. Update styling to modern Tailwind
2. Add modern error states
3. Add success feedback

---

## 📋 Implementation Batch Plan

### Batch 1: Billing Core (4 pages) - 4 hours
1. ✅ Invoices — DONE (ProfileToolbar + ProfileTable)
2. 🔄 Receipts — IN PROGRESS (ProfileToolbar + ProfileTable)
3. TODO: Register (ProfileToolbar + ProfileTable) — 1h
4. TODO: Credit Notes (ProfileToolbar + ProfileTable) — 1h
5. TODO: Debit Notes (ProfileToolbar + ProfileTable) — 1h

### Batch 2: Direct Sales (2 pages) - 2 hours
1. TODO: Direct Sales List (ProfileToolbar + ProfileTable) — 1h
2. TODO: Direct Sales Workspace (Modernize existing) — 1h

### Batch 3: Subscriptions (5 pages) - 5 hours
1. TODO: Subscriptions Hub with plan_type filter — 1h
2. TODO: EMIs List (by plan_type filter) — 1h
3. TODO: Create forms (preserve existing) — 1h
4. TODO: Rent/Lease Hub and lists — 2h

### Batch 4: Products (6 pages) - 6 hours
1. TODO: Products List (ProfileToolbar + ProfileTable) — 1h
2. TODO: PIM Products (ProfileToolbar + ProfileTable) — 1h
3. TODO: PIM Categories (ProfileToolbar + ProfileTable) — 1h
4. TODO: Product Masters (preserve settings) — 1h
5. TODO: Products Workspace (modernize) — 1h
6. TODO: PIM Categories Manage (preserve editor) — 1h

### Batch 5: Brochures (4 pages) - 4 hours
1. TODO: Brochures Hub — 1h
2. TODO: Brochures Settings (preserve) — 1h
3. TODO: Enquiries List (ProfileToolbar + ProfileTable) — 1h
4. TODO: Quotations List (ProfileToolbar + ProfileTable) — 1h

### Batch 6: Contract Amendments (2 pages) - 2 hours
1. TODO: Contract Amendments Hub — 1h
2. TODO: Recontract Report (stats-focused) — 1h

---

## ✨ Complete Implementation Steps

### For Each List Page:
1. Import: ProfileToolbar, ProfileTable, LoadingBlock, ErrorState
2. Define: STATUS_OPTIONS, STATUS_BADGE constants
3. State: rows, loading, error, search, filter
4. Load: useCallback with filter + search
5. Stats: useMemo calculating counts
6. Columns: Define with width, cell formatters
7. Render: ERPPageShell → ProfileToolbar → Table

### For Each Hub Page:
1. Import: LoadingBlock, ErrorState, HubCard
2. Load: Fetch counts via Promise.all
3. Stats: useMemo from counts
4. Render: ERPPageShell → Grid of HubCards

### For Form Pages:
1. Update styling to modern Tailwind
2. Add ProfileToolbar if listing variants
3. Add modern error/success states
4. Preserve validation logic

---

## 🎯 Progress Tracking

### Phase 1 (Critical) - P0
- ✅ 1/12 complete (Invoices)
- 🔄 1/12 in progress (Receipts)
- 📋 10/12 remaining

### Phase 2 (High Priority) - P1
- 📋 10/10 remaining

### Phase 3 (Nice-to-have) - P2
- 📋 6/6 remaining

**Overall: 2/28 complete (7%)**

---

## 🚀 Next Immediate Actions

1. **Complete Receipts page** (in progress)
2. **Create Batch 1** (Billing Core Register, Credit Notes, Debit Notes) — 3 pages, 3 hours
3. **Create Batch 2** (Direct Sales) — 2 pages, 2 hours
4. **Create Batch 3** (Subscriptions) — 5 pages, 5 hours

Each subsequent batch follows same template pattern.

---

## 📝 Quality Checklist Per Page

- [ ] TypeScript: 0 errors
- [ ] Imports: ProfileToolbar, ProfileTable, LoadingBlock, ErrorState
- [ ] State: rows, loading, error, search, filters
- [ ] Stats: Calculated correctly with useMemo
- [ ] Toolbar: Search, filters, refresh working
- [ ] Table: Columns with proper widths and cell formatters
- [ ] Loading state: Shows spinner
- [ ] Error state: Shows with retry button
- [ ] Empty state: Shows helpful message
- [ ] Search: Works client-side
- [ ] Filters: Work server-side (URL params)
- [ ] Actions: Preserved and styled
- [ ] Breadcrumbs: Correct hierarchy
- [ ] Responsive: Mobile-friendly

---

## 💡 Key Patterns to Apply

1. **Always use ProfileToolbar** for list pages
2. **Always use ProfileTable** wrapper or modern table
3. **Stats band at top** of ERPPageShell
4. **Loading/Error/Empty states** for all pages
5. **Client-side search**, server-side filters
6. **Modern Tailwind styling** for all elements
7. **Consistent column widths** (px units)
8. **Status badges** with color coding
9. **Action buttons** in last column
10. **Breadcrumbs** showing hierarchy

---

## 🎊 Expected Final State

All 28 pages will have:
- ✅ Modern ProfileToolbar + ProfileTable components
- ✅ Stats band showing key metrics
- ✅ Professional loading/error states
- ✅ Search and filtering capabilities
- ✅ Consistent Tailwind styling
- ✅ Responsive design
- ✅ TypeScript 0 errors
- ✅ Enterprise-grade UX

**Estimated completion: 20-24 hours total**
