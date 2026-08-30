"use client";
/**
 * Finished Goods list — redirects to the main products register filtered to FG.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function FinishedGoodsListPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/products?type=FINISHED_GOOD");
  }, [router]);
  return <ERPLoadingState label="Loading finished goods…" />;
}
