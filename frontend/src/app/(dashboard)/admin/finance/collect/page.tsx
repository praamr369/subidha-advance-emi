import CollectionInlineReadinessBanner from "@/components/collections/CollectionInlineReadinessBanner";
import AdminPaymentCollectPage from "@/domains/payments/pages/AdminPaymentCollectPage";

export default function AdminFinanceCollectPage({
  searchParams,
}: {
  searchParams: { workflow?: string; outstanding?: string };
}) {
  const isLegacy = searchParams?.workflow === "legacy-receivable" && searchParams?.outstanding;
  const initialQueryString = isLegacy ? `outstanding:${searchParams.outstanding}` : "";

  return (
    <div className="space-y-6">
      <CollectionInlineReadinessBanner role="admin" />
      <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-900 shadow-sm">
        <h2 className="mb-1 font-bold text-blue-900 flex items-center gap-2">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Universal Collection Workspace
        </h2>
        <p className="opacity-90">
          Search across EMI schedules, rent/lease demands, legacy receivables, and pending direct-sale invoices from a single workbench. Use phone number, customer name, contract reference, or invoice ID.
        </p>
      </section>

      <AdminPaymentCollectPage queryString={initialQueryString} />
    </div>
  );
}
