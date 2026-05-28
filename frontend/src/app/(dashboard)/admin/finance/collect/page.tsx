import CollectionInlineReadinessBanner from "@/components/collections/CollectionInlineReadinessBanner";
import AdminPaymentCollectPage from "@/domains/payments/pages/AdminPaymentCollectPage";

export default function AdminFinanceCollectPage() {
  return (
    <div className="space-y-6">
      <CollectionInlineReadinessBanner role="admin" />
      <AdminPaymentCollectPage />
    </div>
  );
}
