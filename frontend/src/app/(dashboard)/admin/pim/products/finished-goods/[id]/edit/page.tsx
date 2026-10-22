"use client";
/**
 * PIM Finished Good edit — renders the full PimProductForm at a type-specific URL.
 */
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

const PimProductForm = dynamic(() => import("@/components/admin/pim/PimProductForm"), {
  loading: () => <ERPLoadingState label="Loading product editor…" />,
  ssr: false,
});

export default function PimFinishedGoodEditPage() {
  const params = useParams<{ id: string }>();
  if (!params?.id) return <ERPLoadingState label="Loading…" />;
  return <PimProductForm productId={Number(params.id)} />;
}
