"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function PimFinishedGoodsListPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/pim/products?type=FINISHED_GOOD");
  }, [router]);
  return <ERPLoadingState label="Loading finished goods…" />;
}
