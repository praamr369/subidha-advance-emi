"use client";
import dynamic from "next/dynamic";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

const PimProductForm = dynamic(() => import("@/components/admin/pim/PimProductForm"), {
  loading: () => <ERPLoadingState label="Loading product editor…" />,
  ssr: false,
});

export default function PimFinishedGoodCreatePage() {
  return <PimProductForm />;
}
