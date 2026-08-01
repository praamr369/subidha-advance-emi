# Admin Dashboard - Quick Start Guide

**Get started with rich interactive admin pages in 5 minutes!**

---

## 🚀 Quick Setup

### Step 1: Add Provider to Root Layout

**File**: `frontend/src/app/layout.tsx` or admin layout

```tsx
import { AdminKeyboardShortcutsProvider } from "@/components/admin/AdminKeyboardShortcuts";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AdminKeyboardShortcutsProvider>
          {children}
        </AdminKeyboardShortcutsProvider>
      </body>
    </html>
  );
}
```

### Step 2: Convert Your First Admin Page

Before:
```tsx
// Old boring table
export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);

  return (
    <table>
      <tbody>
        {customers.map(c => (
          <tr key={c.id}>
            <td>{c.name}</td>
            <td>{c.email}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

After:
```tsx
"use client";

import { InteractiveDataTable } from "@/components/admin/InteractiveDataTable";
import { DataDetailModal } from "@/components/admin/DataDetailModal";
import { useState, useEffect } from "react";
import { Eye, Edit2, Trash2 } from "lucide-react";

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    // Fetch customers
  }, []);

  const rows = customers.map(c => ({
    id: c.id,
    data: [
      { 
        key: "name", 
        label: "Name", 
        value: c.name,
        copyable: true,
      },
      { 
        key: "email", 
        label: "Email", 
        value: c.email,
        type: "email",
        copyable: true,
      },
      { 
        key: "phone", 
        label: "Phone", 
        value: c.phone,
        type: "phone",
        copyable: true,
      },
    ],
    actions: [
      {
        id: "view",
        label: "View",
        icon: <Eye className="w-4 h-4" />,
        onClick: () => setSelected(c),
      },
      {
        id: "edit",
        label: "Edit",
        icon: <Edit2 className="w-4 h-4" />,
        onClick: () => window.location.href = `/admin/customers/${c.id}/edit`,
      },
      {
        id: "delete",
        label: "Delete",
        icon: <Trash2 className="w-4 h-4" />,
        variant: "danger",
        onClick: () => {
          if (confirm("Delete this customer?")) {
            // Delete logic
          }
        },
      },
    ],
    selectable: true,
    expandable: true,
    expandedContent: (
      <div className="space-y-3">
        <p><strong>Customer ID:</strong> {c.id}</p>
        <p><strong>Status:</strong> {c.status}</p>
        <p><strong>Created:</strong> {new Date(c.created_at).toLocaleDateString()}</p>
      </div>
    ),
  }));

  return (
    <>
      <InteractiveDataTable
        rows={rows}
        title="Customers"
        subtitle="Hover • Right-click • Ctrl+Shift+? for shortcuts"
      />

      {selected && (
        <DataDetailModal
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          title="Customer Details"
          subtitle={`ID: ${selected.id}`}
          fields={[
            { key: "name", label: "Name", value: selected.name },
            { key: "email", label: "Email", value: selected.email, type: "email" },
            { key: "phone", label: "Phone", value: selected.phone, type: "phone" },
            { key: "status", label: "Status", value: selected.status, type: "status" },
          ]}
        />
      )}
    </>
  );
}
```

---

## 📊 Data Type Examples

```tsx
// Currency
{ key: "total", label: "Total", value: 59000, type: "currency" }
// Displays: "Rs. 59,000.00"

// Email (clickable)
{ key: "email", label: "Email", value: "user@example.com", type: "email" }
// Displays: "user@example.com" → Click to send email

// Phone (clickable)
{ key: "phone", label: "Phone", value: "9876543210", type: "phone" }
// Displays: "+91 98765 43210" → Click to call

// Date
{ key: "date", label: "Date", value: "2026-07-18", type: "date" }
// Displays: "18 Jul 2026"

// DateTime
{ key: "created", label: "Created", value: "2026-07-18T14:30:00Z", type: "datetime" }
// Displays: "18 Jul 2026 2:30 PM"

// Status (with badge)
{ key: "status", label: "Status", value: "ACTIVE", type: "status" }
// Displays: "ACTIVE" (with green badge)

// JSON (expandable)
{ key: "meta", label: "Metadata", value: {key: "value"}, type: "json" }
// Shows: "[JSON]" → Click to expand/collapse

// Boolean
{ key: "active", label: "Active", value: true, type: "boolean" }
// Displays: "Yes" or "No"

// Array
{ key: "items", label: "Items", value: [1,2,3], type: "array" }
// Displays: "[3 items]"

// Percentage
{ key: "discount", label: "Discount", value: 15, type: "percentage" }
// Displays: "15.00%"
```

---

## ⌨️ Keyboard Shortcuts

### Built-in Global Shortcuts
```
Ctrl+Shift+?     Show/hide shortcuts help
Ctrl+N           Create new item
Ctrl+F           Search/filter
Ctrl+S           Save
Ctrl+Z           Undo
Ctrl+Y           Redo
Delete           Delete selected
Escape           Close modal/Cancel
```

### Register Custom Shortcuts

```tsx
import { useAdminKeyboardShortcuts } from "@/components/admin/AdminKeyboardShortcuts";

export default function MyPage() {
  const { register } = useAdminKeyboardShortcuts();

  useEffect(() => {
    // Export current page
    register("export", {
      keys: ["ctrl", "e"],
      description: "Export data",
      category: "Actions",
      action: () => exportData(),
    });

    // Duplicate selected
    register("duplicate", {
      keys: ["ctrl", "d"],
      description: "Duplicate selected",
      category: "Actions",
      action: () => duplicateSelected(),
    });
  }, [register]);

  return <div>Your page</div>;
}
```

---

## 🎨 Hover Behavior Options

```tsx
// Highlight on hover (default)
<InteractiveDataRow hoverBehavior="highlight" />

// Expand on hover
<InteractiveDataRow hoverBehavior="expand" expandable={true} />

// Preview tooltip
<InteractiveDataRow hoverBehavior="preview" />

// No special behavior
<InteractiveDataRow hoverBehavior="none" />
```

---

## 💡 Advanced Usage

### Bulk Selection

```tsx
const [selected, setSelected] = useState<Set<string>>(new Set());

<InteractiveDataTable
  rows={rows.map(row => ({
    ...row,
    selectable: true,
    highlight: selected.has(row.id),
    onSelect: (checked) => {
      const next = new Set(selected);
      if (checked) next.add(row.id);
      else next.delete(row.id);
      setSelected(next);
    },
  }))}
/>

{selected.size > 0 && (
  <div className="bg-blue-50 p-4">
    <p>{selected.size} items selected</p>
    <button onClick={() => {
      selected.forEach(id => deleteItem(id));
      setSelected(new Set());
    }}>
      Delete All
    </button>
  </div>
)}
```

### Custom Actions with Confirmation

```tsx
{
  id: "archive",
  label: "Archive",
  icon: <Archive className="w-4 h-4" />,
  onClick: () => archiveItem(id),
  requiresConfirm: true,
  confirmMessage: "Archive this item? You can restore it later.",
}
```

### Expandable Rows

```tsx
<InteractiveDataRow
  id={item.id}
  data={[...]}
  expandable={true}
  expandedContent={
    <div className="bg-slate-50 p-4 space-y-2">
      <p><strong>Full Description:</strong></p>
      <p>{item.full_description}</p>
      <pre className="bg-white p-3 rounded text-xs">
        {JSON.stringify(item, null, 2)}
      </pre>
    </div>
  }
/>
```

---

## 🔄 Data Binding

### From API

```tsx
const [data, setData] = useState([]);

useEffect(() => {
  apiFetch("/api/v1/customers/").then(response => {
    // If paginated response with 'results'
    setData(response.results || response);
  });
}, []);
```

### State Sync

```tsx
const [items, setItems] = useState([]);

const handleDelete = async (id) => {
  await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
  setItems(items.filter(i => i.id !== id));
};

const handleUpdate = async (id, data) => {
  const updated = await apiFetch(`/api/customers/${id}`, {
    method: "PATCH",
    body: data,
  });
  setItems(items.map(i => i.id === id ? updated : i));
};
```

---

## 🎯 Common Patterns

### Pattern 1: List + Detail View

```tsx
export default function ListPage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);

  const rows = items.map(item => ({
    id: item.id,
    data: [...],
    actions: [{
      id: "view",
      label: "View",
      onClick: () => setSelected(item),
    }],
  }));

  return (
    <>
      <InteractiveDataTable rows={rows} />
      {selected && <DataDetailModal {...} />}
    </>
  );
}
```

### Pattern 2: Searchable List

```tsx
export default function SearchableList() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");

  const filtered = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <input
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <InteractiveDataTable rows={filtered.map(...)} />
    </>
  );
}
```

### Pattern 3: Bulk Operations

```tsx
export default function BulkOperations() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} items?`)) return;
    
    for (const id of selected) {
      await apiFetch(`/api/items/${id}`, { method: "DELETE" });
    }
    
    setItems(items.filter(i => !selected.has(i.id)));
    setSelected(new Set());
  };

  return (
    <>
      {selected.size > 0 && (
        <button onClick={handleBulkDelete}>
          Delete {selected.size} selected
        </button>
      )}
      <InteractiveDataTable
        rows={items.map(item => ({
          ...item,
          selectable: true,
          highlight: selected.has(item.id),
          onSelect: (checked) => {
            const next = new Set(selected);
            checked ? next.add(item.id) : next.delete(item.id);
            setSelected(next);
          },
        }))}
      />
    </>
  );
}
```

---

## 📱 Mobile Support

All components are responsive:
- ✅ Touch-friendly buttons
- ✅ Context menus on long-press
- ✅ Stacked layout on mobile
- ✅ Keyboard shortcuts work on bluetooth keyboards
- ✅ Adaptive grid (1 column mobile, 2 tablet, 3 desktop)

---

## ✅ Checklist for Implementation

- [ ] Wrap admin layout with `AdminKeyboardShortcutsProvider`
- [ ] Pick first admin page to migrate
- [ ] Replace old table with `InteractiveDataTable`
- [ ] Add click handler to open `DataDetailModal`
- [ ] Add keyboard shortcuts with `useAdminKeyboardShortcuts`
- [ ] Test hover effects
- [ ] Test right-click context menu
- [ ] Test keyboard shortcuts (Ctrl+Shift+?)
- [ ] Test on mobile device
- [ ] Deploy to staging

---

## 📚 File Reference

| File | Purpose |
|------|---------|
| `InteractiveDataTable.tsx` | Main data display component |
| `DataDetailModal.tsx` | Full-screen detail view |
| `AdminKeyboardShortcuts.tsx` | Global keyboard system |
| `AdminPageExample.tsx` | Complete example implementation |
| `admin-data-handlers.ts` | Data type formatting utilities |

---

## 🎓 Learning Path

1. **5 min**: Read this guide
2. **10 min**: Examine `AdminPageExample.tsx`
3. **15 min**: Migrate first admin page
4. **5 min**: Test features and shortcuts
5. **Done!** Repeat for other pages

---

## 🆘 Troubleshooting

### Keyboard shortcuts not working?
- Ensure `AdminKeyboardShortcutsProvider` wraps your admin pages
- Check browser console for errors
- Test with simple shortcut (Ctrl+Shift+?) first

### Context menu not showing?
- Make sure you're right-clicking on the row
- Check that actions array is not empty
- Check browser console for errors

### Data not displaying?
- Verify API endpoint returns data
- Check data format matches expected shape
- Use browser DevTools to inspect props

### Styles not applying?
- Verify Tailwind CSS is configured
- Clear `.next` build cache: `rm -rf .next`
- Restart dev server: `npm run dev`

---

## 🚀 Performance Tips

- Use pagination for large lists (100+ items)
- Memoize data transformation: `useMemo(() => rows.map(...), [items])`
- Lazy-load detail modals on first open
- Use virtual scrolling for 1000+ items (future enhancement)

---

## 📖 Complete Example

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { InteractiveDataTable } from "@/components/admin/InteractiveDataTable";
import { DataDetailModal } from "@/components/admin/DataDetailModal";
import { useAdminKeyboardShortcuts } from "@/components/admin/AdminKeyboardShortcuts";
import { apiFetch } from "@/lib/api";
import { Eye, Edit2, Trash2, Plus } from "lucide-react";

export default function AdminPage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { register } = useAdminKeyboardShortcuts();

  useEffect(() => {
    apiFetch("/api/v1/items/").then(res => {
      setItems(res.results || res);
    });
  }, []);

  useEffect(() => {
    register("create-new", {
      keys: ["ctrl", "n"],
      description: "Create new item",
      category: "Items",
      action: () => window.location.href = "/admin/items/new",
    });

    register("delete-selected", {
      keys: ["delete"],
      description: "Delete selected items",
      category: "Items",
      action: async () => {
        if (!confirm(`Delete ${selectedIds.size} items?`)) return;
        for (const id of selectedIds) {
          await apiFetch(`/api/v1/items/${id}/`, { method: "DELETE" });
        }
        setItems(items.filter(i => !selectedIds.has(i.id)));
        setSelectedIds(new Set());
      },
    });
  }, [register, selectedIds]);

  const rows = useMemo(() => 
    items.map(item => ({
      id: item.id,
      data: [
        { key: "name", label: "Name", value: item.name, copyable: true },
        { key: "email", label: "Email", value: item.email, type: "email", copyable: true },
        { key: "amount", label: "Amount", value: item.amount, type: "currency" },
      ],
      actions: [
        {
          id: "view",
          label: "View",
          icon: <Eye className="w-4 h-4" />,
          onClick: () => setSelected(item),
        },
        {
          id: "edit",
          label: "Edit",
          icon: <Edit2 className="w-4 h-4" />,
          onClick: () => window.location.href = `/admin/items/${item.id}/edit`,
        },
        {
          id: "delete",
          label: "Delete",
          icon: <Trash2 className="w-4 h-4" />,
          variant: "danger",
          onClick: async () => {
            if (confirm("Delete this item?")) {
              await apiFetch(`/api/v1/items/${item.id}/`, { method: "DELETE" });
              setItems(items.filter(i => i.id !== item.id));
            }
          },
          requiresConfirm: true,
        },
      ],
      selectable: true,
      highlight: selectedIds.has(item.id),
      onSelect: (checked) => {
        const next = new Set(selectedIds);
        checked ? next.add(item.id) : next.delete(item.id);
        setSelectedIds(next);
      },
    })),
    [items, selectedIds]
  );

  return (
    <>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Items</h1>
          <p className="text-slate-600">Manage your items - Ctrl+Shift+? for shortcuts</p>
        </div>
        <button
          onClick={() => window.location.href = "/admin/items/new"}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Item
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
          <span className="font-medium">{selectedIds.size} items selected</span>
          <button
            onClick={() => {
              selectedIds.forEach(async (id) => {
                await apiFetch(`/api/v1/items/${id}/`, { method: "DELETE" });
              });
              setItems(items.filter(i => !selectedIds.has(i.id)));
              setSelectedIds(new Set());
            }}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Delete Selected
          </button>
        </div>
      )}

      <InteractiveDataTable
        rows={rows}
        title="All Items"
        subtitle={`${items.length} items total`}
      />

      {selected && (
        <DataDetailModal
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          title="Item Details"
          subtitle={`ID: ${selected.id}`}
          fields={[
            { key: "name", label: "Name", value: selected.name, section: "Basic" },
            { key: "email", label: "Email", value: selected.email, type: "email", section: "Contact" },
            { key: "amount", label: "Amount", value: selected.amount, type: "currency", section: "Pricing" },
          ]}
        />
      )}
    </>
  );
}
```

---

**Ready to build amazing admin experiences!** 🎉
