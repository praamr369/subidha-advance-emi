"use client";
/**
 * Finished Good create page — redirects to the main multi-step product
 * creation wizard which handles Finished Good creation in full detail.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function FinishedGoodCreatePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/products/create");
  }, [router]);
  return <ERPLoadingState label="Opening finished good setup…" />;
}
