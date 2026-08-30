"use client";
import { useParams } from "next/navigation";
import RegisterSimpleTypeForm from "@/components/admin/products/RegisterSimpleTypeForm";

export default function RawMaterialEditPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return null;
  return <RegisterSimpleTypeForm productType="RAW_MATERIAL" productId={Number(params.id)} />;
}
