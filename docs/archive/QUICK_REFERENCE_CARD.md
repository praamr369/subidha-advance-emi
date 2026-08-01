# 28 Pages Modernization - Quick Reference Card

## 🎯 The Pattern (3 Types)

### Type A: List Pages (11 pages) — 1 hour each
```
ProfileToolbar (search + filter + refresh)
    ↓
Modern Table (status badges + actions)
    ↓
Stats Band (key counts)
    ↓
Loading/Error/Empty States
```

**Pages:** invoices✅, receipts, register, credit-notes, debit-notes, direct-sales, pim-products, pim-categories, brochures-enquiries, brochures-quotations, products

### Type B: Hub Pages (5 pages) — 1 hour each
```
Stats Band (key metrics)
    ↓
Grid of Hub Cards (navigation)
    ↓
Loading/Error States
```

**Pages:** billing, rent-lease, contract-amendments, brochures, subscriptions

### Type C: Form Pages (7 pages) — 30 mins to 1 hour each
```
Keep existing form structure
Add modern error states
Add success feedback
Keep validation logic
```

**Pages:** create-pages, workspace-pages, settings-pages

---

## 📋 Copy-Paste Checklist

### Before You Start List Page Refactor:
- [ ] Read MASTER_PAGES_MODERNIZATION_GUIDE.md (Template A section)
- [ ] Look at invoices/page.tsx for working example
- [ ] Copy the template structure
- [ ] Identify your API function name
- [ ] Identify your status/filter options
- [ ] Identify your table columns
- [ ] Replace 3 things: API function, options, columns

### Before You Start Hub Page Refactor:
- [ ] Read MASTER_PAGES_MODERNIZATION_GUIDE.md (Template B section)
- [ ] Identify your data-fetch functions (Promise.all)
- [ ] Identify your hub cards (title, href, icon)
- [ ] Replace 2 things: data loading, hub cards

### Before You Start Form Page Refactor:
- [ ] Keep existing form structure
- [ ] Update input styling to modern Tailwind
- [ ] Add ProfileToolbar if listing variants
- [ ] Add modern error messages
- [ ] Add success notification

---

## 📊 Batch Order

| # | Batch | Pages | Time |
|---|-------|-------|------|
| 1 | Billing Core | register, credit-notes, debit-notes | 3h |
| 2 | Direct Sales | direct-sale, direct-sales, direct-sale/create | 2h |
| 3 | Subscriptions | subscriptions hub + 4 filters + create | 5h |
| 4 | Products & PIM | products, pim-products, pim-categories, + masters + workspace | 6h |
| 5 | Brochures | brochures hub, enquiries, quotations, settings | 4h |
| 6 | Contract Amendments | hub + recontract-report | 2h |

---

## 🔧 Template Structure (Copy-Paste)

```tsx
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ProfileToolbar, ProfileTable } from "@/components/crm-workbench";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import { ROUTES } from "@/lib/routes";

// 1. Your constants
const STATUS_OPTIONS = [{ value: "X", label: "X" }];
const STATUS_BADGE = { X: "bg-X" };

export default function Page() {
  // 2. Your state
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");

  // 3. Your load function
  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const data = await yourFetch({ filter });
      let filtered = data.results;
      if (search) {
        filtered = filtered.filter(row =>
          row.name?.toLowerCase().includes(search.toLowerCase())
        );
      }
      setRows(filtered);
    } catch (err) {
      setError("Error message");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => void loadPage(), [loadPage]);

  // 4. Your stats
  const stats = useMemo(() => [
    { label: "Total", value: rows.length, tone: "info" as const },
  ], [rows]);

  // 5. Your columns
  const COLUMNS = [
    { accessor: "id", header: "ID", width: 80 },
    { accessor: "name", header: "Name", width: 200 },
  ];

  return (
    <ERPPageShell title="Title" stats={stats} breadcrumbs={[...]}>
      <div className="space-y-6">
        <ProfileToolbar
          searchValue={search}
          onSearchChange={setSearch}
          onRefresh={loadPage}
          filters={[{ key: "filter", label: "Filter", options: STATUS_OPTIONS }]}
          filterValues={{ filter }}
          onFilterChange={(k, v) => setFilter(v)}
          onApply={() => {}}
          onReset={() => { setSearch(""); setFilter(""); }}
        />

        {loading && <LoadingBlock label="Loading..." />}
        {error && <ErrorState title="Error" description={error} onRetry={loadPage} />}

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
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/20">
                    {COLUMNS.map(col => (
                      <td key={`${row.id}-${col.accessor}`} className="px-3 py-2" style={{ width: col.width }}>
                        {(row as any)[col.accessor]}
                      </td>
                    ))}
                    <td className="px-3 py-2">Actions here</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
```

---

## ✅ Quality Checklist (Per Page)

```
Page: ________________

TypeScript
  [ ] npm run build passes
  [ ] 0 errors in file

Components
  [ ] ProfileToolbar imported
  [ ] ProfileTable logic used
  [ ] LoadingBlock imported
  [ ] ErrorState imported

State
  [ ] rows: T[]
  [ ] loading: boolean
  [ ] error: string | null
  [ ] search: string
  [ ] filters: Record<string, string>

Features
  [ ] Search works (client-side)
  [ ] Filter works (server-side)
  [ ] Stats calculated (useMemo)
  [ ] Loading state shows
  [ ] Error state shows with retry
  [ ] Empty state shows message
  [ ] Table has status badges
  [ ] Table has proper column widths
  [ ] Actions preserved

Design
  [ ] ProfileToolbar visible
  [ ] Stats band visible
  [ ] Table styled modern
  [ ] Responsive on mobile
  [ ] Breadcrumbs correct

Browser Test
  [ ] Page loads without errors
  [ ] Search updates results
  [ ] Filter updates results
  [ ] Refresh button works
  [ ] Loading/error/empty states work
  [ ] All actions functional
```

---

## 🚀 Time Estimates

| Task | Time |
|------|------|
| Complete Receipts | 30 min |
| Do one Batch 1 page | 1 hour |
| Do entire Batch 1 | 3 hours |
| Do entire Batch 2 | 2 hours |
| Do entire Batch 3 | 5 hours |
| Do entire Batch 4 | 6 hours |
| Do entire Batch 5 | 4 hours |
| Do entire Batch 6 | 2 hours |
| **TOTAL** | **~23.5 hours** |

---

## 📖 Documentation Map

| Need | Document |
|------|----------|
| Complete template code | MASTER_PAGES_MODERNIZATION_GUIDE.md |
| Batch planning | SALES_BILLING_MODERNIZATION_PLAN.md |
| Status + next steps | PAGES_MODERNIZATION_COMPLETION_REPORT.md |
| Quick reference | THIS FILE |
| Working example | /billing/invoices/page.tsx |

---

## 🎯 Your Next Action

1. **Right now:** Complete Receipts page (30 mins)
2. **Then:** Pick Batch 1 page #1 (Register)
3. **Use:** Template A from MASTER guide
4. **Follow:** Copy-paste structure
5. **Test:** Use quality checklist
6. **Repeat:** For all 26 remaining pages

---

## 💡 Pro Tips

1. **Template is everything** — don't invent new patterns
2. **Search is always client-side** — filters are server-side
3. **Stats use useMemo** — prevents unnecessary recalculations
4. **Column widths are px** — ensures responsive tables
5. **Status badges matter** — color-code everything
6. **Error state is required** — no silent failures
7. **Empty state matters** — tell users why there's nothing

---

## 🎊 You're Ready!

✅ Framework complete  
✅ Templates provided  
✅ Examples working  
✅ Batch plan defined  
✅ Quality gates set  

**Go refactor those 28 pages!** 🚀
