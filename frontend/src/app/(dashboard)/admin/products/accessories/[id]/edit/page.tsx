"use client";
import { useParams } from "next/navigation";
import RegisterSimpleTypeForm from "@/components/admin/products/RegisterSimpleTypeForm";

export default function AccessoryEditPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return null;
  return <RegisterSimpleTypeForm productType="ACCESSORY" productId={Number(params.id)} />;
}
