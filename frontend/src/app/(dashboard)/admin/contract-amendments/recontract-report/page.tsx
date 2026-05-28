import AdminRecontractReport from "@/components/amendments/AdminRecontractReport";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    executed?: string;
    customer_consent_status?: string;
    admin_approval_status?: string;
    product?: string;
    customer?: string;
    date_from?: string;
    date_to?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <AdminRecontractReport
      filters={{
        executed: resolvedSearchParams.executed || "",
        customerConsentStatus: resolvedSearchParams.customer_consent_status || "",
        adminApprovalStatus: resolvedSearchParams.admin_approval_status || "",
        product: resolvedSearchParams.product || "",
        customer: resolvedSearchParams.customer || "",
        dateFrom: resolvedSearchParams.date_from || "",
        dateTo: resolvedSearchParams.date_to || "",
      }}
    />
  );
}
