import CollectionInlineReadinessBanner from "@/components/collections/CollectionInlineReadinessBanner";
import AdminPaymentCollectPage from "@/domains/payments/pages/AdminPaymentCollectPage";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";

export default async function AdminFinanceCollectPage(props: {
  searchParams: Promise<{
    workflow?: string;
    outstanding?: string;
    subscription?: string;
    context?: string;
    sale_id?: string;
    direct_sale_id?: string;
    direct_sale?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const isLegacy = searchParams?.workflow === "legacy-receivable" && searchParams?.outstanding;
  const directSaleId = searchParams?.sale_id || searchParams?.direct_sale_id || searchParams?.direct_sale;

  let initialQueryString = "";
  if (isLegacy) {
    initialQueryString = `?outstanding=${searchParams.outstanding}`;
  } else if (searchParams?.subscription) {
    initialQueryString = `?subscription=${searchParams.subscription}`;
    if (searchParams.context) {
      initialQueryString += `&context=${searchParams.context}`;
    }
  } else if (directSaleId) {
    initialQueryString = `?direct_sale=${directSaleId}`;
  }

  return (
    <ERPPageShell
      eyebrow="Finance Operations"
      title="Universal Collection Workspace"
      subtitle="Search across EMI schedules, rent/lease demands, legacy receivables, and pending direct-sale invoices from a single workbench."
      breadcrumbs={[
        { href: ROUTES.admin.dashboard, label: "Admin" },
        { href: ROUTES.admin.finance, label: "Finance Workspace" },
        { label: "Collection" },
      ]}
    >
      <div className="space-y-6">
        <CollectionInlineReadinessBanner role="admin" />
        <AdminPaymentCollectPage queryString={initialQueryString} />
      </div>
    </ERPPageShell>
  );
}
