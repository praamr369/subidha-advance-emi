"use client";
import { useParams } from "next/navigation";
import ERPPageShell from "@/components/erp/ERPPageShell";
import PimProductForm from "@/components/admin/pim/PimProductForm";

export default function PimEditProductPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return null;
  
  return (
    <ERPPageShell
      title="Edit PIM Product"
      subtitle="Update product details, attributes and variants"
    >
      <PimProductForm productId={Number(params.id)} />
    </ERPPageShell>
  );
}
