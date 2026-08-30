"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function AccessoriesListPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/products?type=ACCESSORY");
  }, [router]);
  return <ERPLoadingState label="Loading accessories…" />;
}
