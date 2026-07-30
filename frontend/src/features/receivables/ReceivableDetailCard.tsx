import { formatCurrency } from "@/lib/format";
import type { UnifiedReceivableResult } from "@/services/receivables";

interface ReceivableDetailCardProps {
  receivable: UnifiedReceivableResult;
}

export default function ReceivableDetailCard({ receivable }: ReceivableDetailCardProps) {
  return (
    <div className="mb-6 rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="border-b px-6 py-4">
        <h3 className="text-lg font-semibold leading-none tracking-tight">
          Billing Details Confirmation
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Verify the customer and contract information before posting collection.
        </p>
      </div>
      <div className="p-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Customer Name</p>
          <p className="font-medium">{receivable.customer_name || "N/A"}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Phone</p>
          <p className="font-medium">{receivable.phone_masked || "N/A"}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Reference / Invoice</p>
          <p className="font-medium">{receivable.display_reference || receivable.reference_no}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Type</p>
          <p className="font-medium">{receivable.source_type}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Product Summary</p>
          <p className="font-medium">{receivable.product_summary || "N/A"}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Amount Due</p>
          <p className="font-medium text-emerald-600">
            {formatCurrency(Number(receivable.due_amount) || 0)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Contract Total</p>
          <p className="font-medium">
            {formatCurrency(Number(receivable.total_amount) || 0)}
          </p>
        </div>
      </div>
    </div>
  );
}
