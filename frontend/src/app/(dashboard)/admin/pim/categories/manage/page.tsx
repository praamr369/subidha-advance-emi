"use client";
import ERPPageShell from "@/components/erp/ERPPageShell";
import CategoryManageWorkbench from "@/components/admin/pim/CategoryManageWorkbench";

export default function PimCategoryManagePage() {
  return (
    <ERPPageShell
      eyebrow="PIM"
      title="Manage PIM Categories"
      subtitle="Create and edit product categories, subcategories, and attribute templates."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "PIM Categories", href: "/admin/pim/categories" },
        { label: "Manage" },
      ]}
      actions={[
        { href: "/admin/pim/categories", label: "View Overview", variant: "secondary" },
        { href: "/admin/pim/products", label: "PIM Products", variant: "secondary" },
      ]}
      statusBadge={{ label: "Category Editor", tone: "info" }}
    >
      <CategoryManageWorkbench />
    </ERPPageShell>
  );
}
