"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function PimAccessoriesListPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/pim/products?type=ACCESSORY");
  }, [router]);
  return <ERPLoadingState label="Loading accessories…" />;
}
