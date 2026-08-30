"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function RawMaterialsListPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/products?type=RAW_MATERIAL");
  }, [router]);
  return <ERPLoadingState label="Loading raw materials…" />;
}
