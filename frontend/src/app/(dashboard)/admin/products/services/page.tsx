"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function ServicesListPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/products?type=SERVICE");
  }, [router]);
  return <ERPLoadingState label="Loading services…" />;
}
