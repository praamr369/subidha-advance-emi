# Modern Components - Quick Reference Guide

**Print this page for your desk!** 🖨️  
**Keep it open while coding** ⌨️

---

## 📦 Components at a Glance

| Component | Purpose | Usage | Lines |
|-----------|---------|-------|-------|
| **ModernDashboardShell** | Main page layout | Page wrapper | 150 |
| **ModernStatsGrid** | KPI metrics grid | Top of dashboards | 80 |
| **ModernCard** | Content container | Main content area | 120 |
| **ModernButton** | Interactive button | Forms & actions | 110 |
| **ModernBadge** | Status indicator | Status fields | 130 |
| **ModernFormGroup** | Form field wrapper | Form inputs | 120 |
| **ModernKPICard** | Single metric card | Individual stats | 170 |

---

## 1️⃣ ModernDashboardShell

**Purpose**: Main page layout wrapper  
**Use for**: Every page that needs consistent header and navigation

### Basic Usage
```tsx
import { ModernDashboardShell } from "@/components/modern";

export default function MyPage() {
  return (
    <ModernDashboardShell
      title="Page Title"
      subtitle="Page description"
      breadcrumbs={[
        { label: "Admin" },
        { label: "Current Page" }
      ]}
    >
      {/* Your page content */}
    </ModernDashboardShell>
  );
}
```

### All Props
```tsx
<ModernDashboardShell
  title="Required: Main title"
  subtitle="Optional: Subtitle"
  breadcrumbs={[{label: "Home"}, {label: "Current"}]}
  onSearch={(query) => {}}  // Optional search
  notificationCount={5}     // Optional notification badge
  onSettings={() => {}}     // Optional settings click
  children={/* content */}
/>
```

### When to Use
✅ Dashboards  
✅ List pages  
✅ Detail pages  
✅ Form pages  
✅ Analytics pages  

### When NOT to Use
❌ Modal dialogs  
❌ Sidebar panels  
❌ Pop-up menus  

---

## 2️⃣ ModernStatsGrid

**Purpose**: Display multiple KPI metrics in responsive grid  
**Use for**: Dashboard top section with key numbers

### Basic Usage
```tsx
import { ModernStatsGrid } from "@/components/modern";
import { TrendingUp } from "lucide-react";

export default function Dashboard() {
  return (
    <ModernStatsGrid
      title="Key Metrics"
      columns={4}
      stats={[
        {
          title: "Revenue",
          value: 5000000,
          format: (v) => `Rs. ${(v/100000).toFixed(1)}L`,
          color: "green",
          icon: <TrendingUp className="w-5 h-5" />,
          trend: { value: 15, direction: "up" },
        },
        // More stats...
      ]}
    />
  );
}
```

### Props Explained
```tsx
{
  title: "Section title",           // Optional
  columns: 4,                       // 1-4 columns
  gap: "gap-6",                     // Spacing
  stats: [
    {
      title: "Metric name",         // Required
      value: 12345,                 // Required
      format: (v) => `$${v}`,       // Optional formatter
      color: "blue",                // green, red, amber, etc.
      icon: <Icon />,               // Optional icon
      subtitle: "Description",      // Optional
      trend: {                       // Optional trend
        value: 15,                  // Percentage
        direction: "up" | "down"    // Direction
      },
      onClick: () => {}             // Optional click handler
    }
  ]
}
```

### Colors Available
```tsx
"blue"    // Primary blue
"green"   // Success green
"red"     // Danger red
"amber"   // Warning amber
"purple"  // Premium purple
"pink"    // Highlight pink
"slate"   // Neutral gray
"cyan"    // Data cyan
```

### Responsive Behavior
```
Mobile (< 768px): 1 column
Tablet (768-1024px): 2 columns
Desktop (> 1024px): 4 columns (or as specified)
```

---

## 3️⃣ ModernCard

**Purpose**: Flexible content container  
**Use for**: Main content sections, cards, panels

### Basic Usage
```tsx
import { ModernCard } from "@/components/modern";

export default function Dashboard() {
  return (
    <ModernCard
      title="Section Title"
      subtitle="Optional subtitle"
      action={<button>Action Button</button>}
    >
      {/* Your content here */}
    </ModernCard>
  );
}
```

### With Loading State
```tsx
<ModernCard
  title="Data Section"
  loading={isLoading}
  loadingText="Loading..."
>
  {data && /* Your content */}
</ModernCard>
```

### With Error Handling
```tsx
<ModernCard
  title="Data Section"
  error={error?.message}
  errorAction={() => retry()}
>
  {/* Your content */}
</ModernCard>
```

### With Badge
```tsx
<ModernCard
  title="Section"
  badge={{ text: "Beta", color: "amber" }}
>
  {/* Content */}
</ModernCard>
```

### All Props
```tsx
<ModernCard
  title="Title"                    // Required
  subtitle="Subtitle"              // Optional
  action={<ReactNode>}             // Optional action in header
  badge={{                         // Optional badge
    text: "New",
    color: "blue"
  }}
  loading={false}                  // Optional loading state
  loadingText="Loading..."         // Optional loading text
  error={undefined}                // Optional error message
  errorAction={() => {}}           // Optional error action
  onClick={() => {}}               // Optional click handler
  className="extra-classes"        // Optional extra CSS
  children={/* content */}         // Required content
/>
```

---

## 4️⃣ ModernButton

**Purpose**: Interactive button with multiple styles  
**Use for**: Clicks, form submissions, navigation

### Quick Reference
```tsx
import { ModernButton } from "@/components/modern";
import { Plus } from "lucide-react";

// Default primary button
<ModernButton>Click Me</ModernButton>

// Different variants
<ModernButton variant="primary">Primary</ModernButton>
<ModernButton variant="secondary">Secondary</ModernButton>
<ModernButton variant="outline">Outline</ModernButton>
<ModernButton variant="ghost">Ghost</ModernButton>
<ModernButton variant="danger">Danger</ModernButton>
<ModernButton variant="success">Success</ModernButton>
<ModernButton variant="warning">Warning</ModernButton>

// Different sizes
<ModernButton size="sm">Small</ModernButton>
<ModernButton size="md">Medium (default)</ModernButton>
<ModernButton size="lg">Large</ModernButton>

// With icon
<ModernButton icon={<Plus />}>Add Item</ModernButton>
<ModernButton icon={<Plus />} iconPosition="right">Add</ModernButton>

// Loading state
<ModernButton loading={isLoading} loadingText="Saving...">
  Save
</ModernButton>

// Disabled state
<ModernButton disabled>Disabled</ModernButton>

// Full width
<ModernButton fullWidth>Full Width Button</ModernButton>
```

### Variants Explained
```
primary:    Blue background, white text (default action)
secondary:  Gray background, dark text (secondary action)
outline:    Transparent bg, border (tertiary action)
ghost:      No styling (quaternary action)
danger:     Red background (destructive action)
success:    Green background (positive action)
warning:    Amber background (caution action)
```

### Common Patterns
```tsx
// Form submit
<ModernButton type="submit" variant="primary">
  Save
</ModernButton>

// Cancel button
<ModernButton variant="outline" onClick={() => close()}>
  Cancel
</ModernButton>

// Delete action
<ModernButton variant="danger" onClick={deleteItem}>
  Delete
</ModernButton>

// Loading state during API call
<ModernButton
  loading={isSaving}
  loadingText="Saving..."
  onClick={async () => {
    await saveData();
  }}
>
  Save Changes
</ModernButton>
```

---

## 5️⃣ ModernBadge

**Purpose**: Status indicators and tags  
**Use for**: Status fields, tags, categories

### Quick Reference
```tsx
import { ModernBadge } from "@/components/modern";

// Default badge
<ModernBadge>Tag</ModernBadge>

// With color
<ModernBadge color="green">Active</ModernBadge>
<ModernBadge color="red">Inactive</ModernBadge>
<ModernBadge color="amber">Pending</ModernBadge>
<ModernBadge color="blue">Info</ModernBadge>

// Different variants
<ModernBadge variant="solid">Solid (default)</ModernBadge>
<ModernBadge variant="outline">Outline</ModernBadge>
<ModernBadge variant="soft">Soft (default)</ModernBadge>

// Different sizes
<ModernBadge size="sm">Small</ModernBadge>
<ModernBadge size="md">Medium (default)</ModernBadge>
<ModernBadge size="lg">Large</ModernBadge>

// With icon
<ModernBadge icon={<CheckCircle />}>Approved</ModernBadge>

// Removable
<ModernBadge removable onRemove={() => deleteTag()}>
  Tag Name
</ModernBadge>
```

### Status Mapping
```tsx
const statusColor = {
  active: "green",
  inactive: "slate",
  pending: "amber",
  approved: "green",
  rejected: "red",
  draft: "blue",
  archived: "slate",
  urgent: "red",
};

<ModernBadge color={statusColor[status]}>
  {status}
</ModernBadge>
```

### In Table Rows
```tsx
<table>
  <tbody>
    {items.map(item => (
      <tr key={item.id}>
        <td>{item.name}</td>
        <td>
          <ModernBadge color={getStatusColor(item.status)}>
            {item.status}
          </ModernBadge>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

---

## 6️⃣ ModernFormGroup

**Purpose**: Wrap form inputs with label, validation  
**Use for**: Form pages, input fields

### Basic Usage
```tsx
import { ModernFormGroup } from "@/components/modern";

export default function FormPage() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});

  return (
    <form>
      <ModernFormGroup
        label="Email"
        required={true}
        error={errors.email}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
        />
      </ModernFormGroup>
    </form>
  );
}
```

### All Features
```tsx
<ModernFormGroup
  label="Field Label"             // Required
  required={false}                // Optional required indicator
  error={errorMessage}            // Optional error message
  success={successMessage}        // Optional success message
  info={infoMessage}             // Optional info/hint text
  disabled={false}               // Optional disabled state
  helpText="Help text"           // Optional helper text
>
  {/* Input field goes here */}
</ModernFormGroup>
```

### With Different States
```tsx
// Error state
<ModernFormGroup
  label="Email"
  required
  error="Please enter a valid email"
>
  <input type="email" value={invalidEmail} />
</ModernFormGroup>

// Success state
<ModernFormGroup
  label="Email"
  success="Email verified"
>
  <input type="email" value={validEmail} />
</ModernFormGroup>

// Info/Help text
<ModernFormGroup
  label="Password"
  info="At least 8 characters with uppercase"
  helpText="Use a strong password"
>
  <input type="password" />
</ModernFormGroup>

// Disabled
<ModernFormGroup label="ID" disabled>
  <input type="text" value={id} disabled />
</ModernFormGroup>
```

### Form Layout Pattern
```tsx
<form onSubmit={handleSubmit} className="space-y-6">
  <div>
    <h3 className="text-sm font-semibold mb-4">Section 1</h3>
    <div className="grid grid-cols-2 gap-4">
      <ModernFormGroup label="Field 1">
        <input />
      </ModernFormGroup>
      <ModernFormGroup label="Field 2">
        <input />
      </ModernFormGroup>
    </div>
  </div>

  <div className="flex gap-3 pt-6 border-t">
    <ModernButton type="submit" variant="primary">
      Save
    </ModernButton>
    <ModernButton type="button" variant="outline">
      Cancel
    </ModernButton>
  </div>
</form>
```

---

## 7️⃣ ModernKPICard

**Purpose**: Single metric card with details  
**Use for**: Standalone stats, side panels

### Basic Usage
```tsx
import { ModernKPICard } from "@/components/modern";
import { Wallet } from "lucide-react";

<ModernKPICard
  title="Total Revenue"
  value={5000000}
  format={(v) => `Rs. ${(v/100000).toFixed(1)}L`}
  color="green"
  icon={<Wallet className="w-6 h-6" />}
  trend={{ value: 15, direction: "up" }}
  subtitle="Last 30 days"
  onClick={() => navigate('/revenue')}
/>
```

### Sizes
```tsx
<ModernKPICard size="sm">   {/* Small card */}
<ModernKPICard size="md">   {/* Medium card (default) */}
<ModernKPICard size="lg">   {/* Large card */}
```

### All Props
```tsx
{
  title: "Metric Name",           // Required
  value: 123456,                  // Required
  format: (v) => string,          // Optional formatter
  color: "blue",                  // Optional color
  icon: <ReactNode>,              // Optional icon
  trend: {                        // Optional trend
    value: 15,
    direction: "up" | "down"
  },
  subtitle: "Description",        // Optional subtitle
  onClick: () => {},              // Optional click
  size: "md",                     // sm, md, lg
  loading: false,                 // Optional loading state
  error: null,                    // Optional error
}
```

---

## 🎯 Common Patterns

### Dashboard Top Section
```tsx
<ModernDashboardShell title="Dashboard" breadcrumbs={[...]}>
  <ModernStatsGrid columns={4} stats={[...]} />
  
  <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
    <ModernCard title="Section 1">{/* ... */}</ModernCard>
    <ModernCard title="Section 2">{/* ... */}</ModernCard>
  </div>
</ModernDashboardShell>
```

### List Page Table
```tsx
<ModernCard title="Items" action={<ModernButton>Add</ModernButton>}>
  <table className="w-full">
    <thead className="bg-slate-50">
      <tr>
        <th className="px-4 py-2 text-left">Name</th>
        <th className="px-4 py-2 text-left">Status</th>
        <th className="px-4 py-2 text-right">Actions</th>
      </tr>
    </thead>
    <tbody>
      {items.map(item => (
        <tr key={item.id} className="border-b hover:bg-slate-50">
          <td className="px-4 py-2">{item.name}</td>
          <td className="px-4 py-2">
            <ModernBadge color={getColor(item.status)}>
              {item.status}
            </ModernBadge>
          </td>
          <td className="px-4 py-2 text-right">
            <ModernButton size="sm" variant="outline">
              View
            </ModernButton>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</ModernCard>
```

### Form Page
```tsx
<div className="max-w-2xl">
  <ModernCard title="Create Item">
    <form onSubmit={handleSubmit} className="space-y-6">
      <ModernFormGroup label="Name" required>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </ModernFormGroup>
      
      <ModernFormGroup label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>Active</option>
          <option>Inactive</option>
        </select>
      </ModernFormGroup>

      <div className="flex gap-3 pt-6 border-t">
        <ModernButton type="submit" variant="primary">
          Create
        </ModernButton>
        <ModernButton type="button" variant="outline">
          Cancel
        </ModernButton>
      </div>
    </form>
  </ModernCard>
</div>
```

---

## 🎨 CSS Classes Quick Reference

### Spacing
```
p-2  → 8px padding
p-4  → 16px padding
p-6  → 24px padding
mb-4 → 16px margin-bottom
mt-8 → 32px margin-top
gap-4 → 16px gap between items
```

### Grid
```
grid grid-cols-1           → 1 column (mobile)
md:grid-cols-2            → 2 columns (tablet)
lg:grid-cols-4            → 4 columns (desktop)
gap-6                     → 24px spacing
```

### Text
```
text-sm          → 14px
text-base        → 16px
font-semibold    → Bold
font-medium      → Medium weight
text-slate-600   → Gray text
text-slate-900   → Dark text
```

### Colors (Dark Mode Aware)
```
bg-white dark:bg-slate-900
text-slate-900 dark:text-white
border-slate-200 dark:border-slate-700
hover:bg-slate-50 dark:hover:bg-slate-800
```

---

## ⚡ Shortcuts

### For Common Conversions
```tsx
// Currency to display
format: (v) => `Rs. ${(v/100000).toFixed(1)}L`

// Percentage
format: (v) => `${v.toFixed(1)}%`

// Thousands separator
format: (v) => v.toLocaleString('en-IN')

// Date
format: (v) => new Date(v).toLocaleDateString('en-IN')
```

### For Common Colors by Status
```tsx
const statusColor = {
  'active': 'green',
  'inactive': 'slate',
  'pending': 'amber',
  'approved': 'green',
  'rejected': 'red',
  'draft': 'blue',
};
```

### For Responsive Columns
```
Mobile:  1 column   (< 768px)
Tablet:  2 columns  (768-1024px)
Desktop: 4 columns  (> 1024px)

Use: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
```

---

## 📚 Import Statement

Copy this for every new file:

```tsx
import {
  ModernDashboardShell,
  ModernStatsGrid,
  ModernCard,
  ModernButton,
  ModernBadge,
  ModernFormGroup,
  ModernKPICard,
} from "@/components/modern";
```

Or just import what you need:

```tsx
import { ModernCard, ModernButton } from "@/components/modern";
```

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Dark mode not working | Ensure Tailwind dark: is configured |
| Spacing looks off | Check grid gaps: `gap-4` or `gap-6` |
| Colors not right | Verify color name: blue, green, red, amber |
| Mobile broken | Add responsive classes: `md:` and `lg:` |
| Components not found | Check import path: `@/components/modern` |
| Button not clickable | Verify onClick handler is set |
| Form not submitting | Check form onSubmit is set correctly |

---

## 🎊 You're Ready!

**Print this page**  
**Keep it at your desk**  
**Reference while coding**  

You now have everything needed to:
✅ Create dashboards  
✅ Build list pages  
✅ Make form pages  
✅ Add cards and metrics  
✅ Use buttons and badges  
✅ Group form fields  

**Happy coding!** 🚀
