"use client";
import { useParams } from "next/navigation";
import PimProductForm from "@/components/admin/pim/PimProductForm";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function PimAccessoryEditPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return <ERPLoadingState label="Loading…" />;
  return <PimProductForm productId={Number(params.id)} defaultProductType="ACCESSORY" />;
}
