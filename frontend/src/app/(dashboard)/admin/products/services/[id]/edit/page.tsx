"use client";
import { useParams } from "next/navigation";
import RegisterSimpleTypeForm from "@/components/admin/products/RegisterSimpleTypeForm";

export default function ServiceEditPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return null;
  return <RegisterSimpleTypeForm productType="SERVICE" productId={Number(params.id)} />;
}
