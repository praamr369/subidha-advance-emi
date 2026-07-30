import React from "react";
import { SmartCollectionPlan } from "@/services/smart-collection";
import { ArrowRight, CheckCircle, Info, ShieldCheck } from "lucide-react";

interface SmartCollectionPreviewProps {
  plan: SmartCollectionPlan;
}

export default function SmartCollectionPreview({ plan }: SmartCollectionPreviewProps) {
  const { allocations, skipped, opening, closing } = plan;

  const getStepLabel = (step: string) => {
    switch (step) {
      case "ADVANCE_TO_EMI":
        return "Customer Advance applied to EMI";
      case "CASH_TO_EMI":
        return "Cash applied to EMI";
      case "CASH_TO_DIRECT_SALE":
        return "Cash applied to Direct Sale";
      case "CASH_TO_ADVANCE":
        return "Remaining Cash deposited to Advance";
      default:
        return step;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 p-4 rounded-lg border border-primary/20 bg-primary/5 text-primary">
        <ShieldCheck className="h-5 w-5" />
        <span className="text-sm font-medium">
          This is a verified backend allocation plan. Your money will be routed exactly as shown below.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Starting Balance</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unapplied Advance:</span>
              <span className="font-medium">₹{opening.advance_balance}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unpaid EMIs:</span>
              <span className="font-medium">₹{opening.emi_outstanding_total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unpaid Direct Sales:</span>
              <span className="font-medium">₹{opening.direct_sale_outstanding_total}</span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ending Balance</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unapplied Advance:</span>
              <span className="font-medium">₹{closing.advance_balance}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unallocated Cash:</span>
              <span className="font-medium">₹{closing.cash_unallocated}</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-foreground mb-4">Allocation Steps</h4>
        {allocations.length === 0 ? (
          <div className="text-sm text-muted-foreground italic p-4 text-center border rounded-lg">
            No allocations will be made.
          </div>
        ) : (
          <div className="space-y-3">
            {allocations.map((alloc, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-md border bg-card text-sm shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted w-6 h-6 flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="font-medium">{getStepLabel(alloc.step)}</div>
                    <div className="text-muted-foreground text-xs">
                      {alloc.subscription_number && `Sub: ${alloc.subscription_number} | Month: ${alloc.month_no}`}
                      {alloc.sale_no && `Sale No: ${alloc.sale_no}`}
                    </div>
                  </div>
                </div>
                <div className="font-bold text-foreground">
                  ₹{alloc.amount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {skipped && skipped.length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning/5 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-warning-foreground mb-3">
            <Info className="h-4 w-4" />
            Skipped Items
          </h4>
          <div className="space-y-2 text-sm">
            {skipped.map((skip, idx) => (
              <div key={idx} className="flex justify-between items-center bg-background/50 p-2 rounded">
                <span className="text-muted-foreground">EMI ID: {skip.emi_id}</span>
                <span className="text-muted-foreground">Required: ₹{skip.emi_amount}</span>
                <span className="text-warning-foreground text-xs bg-warning/20 px-2 py-1 rounded">
                  {skip.reason.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Note: Subidha rules prohibit partial EMI payments. Insufficient funds flow to the next priority bucket.
          </p>
        </div>
      )}
    </div>
  );
}
