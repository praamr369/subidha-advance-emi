"use client";
/**
 * PIM Finished Good edit — renders the full PimProductForm at a type-specific URL.
 */
import { useParams } from "next/navigation";
import PimProductForm from "@/components/admin/pim/PimProductForm";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function PimFinishedGoodEditPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return <ERPLoadingState label="Loading…" />;
  return <PimProductForm productId={Number(params.id)} />;
}
