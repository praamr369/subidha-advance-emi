import CollectionInlineReadinessBanner from "@/components/collections/CollectionInlineReadinessBanner";
import AdminPaymentCollectPage from "@/domains/payments/pages/AdminPaymentCollectPage";

export default function AdminFinanceCollectPage() {
  return (
    <div className="space-y-6">
      <CollectionInlineReadinessBanner role="admin" />
      <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
        Unified search can route Advance EMI, direct-sale receivables, and rent/lease source collections into their approved backend-safe collection paths. Rent/lease accounting posting remains audit-deferred until the posting bridge is separately approved.
      </section>
      <AdminPaymentCollectPage />
    </div>
  );
}
