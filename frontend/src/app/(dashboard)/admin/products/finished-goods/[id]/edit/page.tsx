"use client";
/**
 * Finished Good edit — thin redirect to the canonical FG edit page.
 * The full Finished Good register form lives at /admin/products/[id]/edit.
 */
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function FinishedGoodEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    if (params?.id) router.replace(`/admin/products/${params.id}/edit`);
  }, [params?.id, router]);
  return <ERPLoadingState label="Loading finished good…" />;
}
