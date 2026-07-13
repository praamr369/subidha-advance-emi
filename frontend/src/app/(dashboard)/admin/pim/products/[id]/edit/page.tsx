"use client";
import { use } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import PimProductForm from "@/components/admin/pim/PimProductForm";

export default function PimEditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <ERPPageShell
      title="Edit PIM Product"
      subtitle="Update product details, attributes and variants"
    >
      <PimProductForm productId={Number(id)} />
    </ERPPageShell>
  );
}
