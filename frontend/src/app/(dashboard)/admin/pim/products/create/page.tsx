"use client";
import ERPPageShell from "@/components/erp/ERPPageShell";
import PimProductForm from "@/components/admin/pim/PimProductForm";

export default function PimCreateProductPage() {
  return (
    <ERPPageShell
      title="New PIM Product"
      subtitle="Create a product with dynamic category-specific attributes"
    >
      <PimProductForm />
    </ERPPageShell>
  );
}
