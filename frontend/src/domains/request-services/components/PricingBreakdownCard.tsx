"use client";

import { formatRupee } from "@/lib/utils/currency";

interface PricingBreakdownCardProps {
  unitPrice?: string | number;
  subTotal?: string | number;
  taxPercentage?: string | number;
  taxAmount?: string | number;
  gstAmount?: string | number;
  deliveryCost?: string | number;
  discountAmount?: string | number;
  totalAmount: string | number;
  quantity?: number;
  title?: string;
}

export default function PricingBreakdownCard({
  unitPrice,
  subTotal,
  taxPercentage,
  taxAmount,
  gstAmount,
  deliveryCost,
  discountAmount,
  totalAmount,
  quantity,
  title = "Pricing Breakdown",
}: PricingBreakdownCardProps) {
  const lineItems = [
    { label: "Unit Price", value: unitPrice, show: !!unitPrice },
    { label: "Quantity", value: quantity, show: quantity ? true : false, format: false },
    { label: "Sub Total", value: subTotal, show: !!subTotal },
    { label: "Tax", value: taxAmount, show: !!taxAmount },
    { label: "GST", value: gstAmount, show: !!gstAmount },
    { label: "Delivery Cost", value: deliveryCost, show: !!deliveryCost },
  ];

  const reductions = [
    { label: "Discount", value: discountAmount, show: !!discountAmount },
  ];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden max-w-2xl">
      {title && (
        <div className="px-6 py-4 border-b border-border bg-muted/40">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
      )}

      <div className="divide-y divide-border">
        {/* Line Items - Desktop Two-Column Layout */}
        <div className="grid grid-cols-2 gap-px">
          {lineItems.filter((item) => item.show).map((item, idx) => (
            <div key={idx} className="px-6 py-4 flex justify-between text-sm hover:bg-muted/20 transition">
              <span className="text-muted-foreground font-medium">{item.label}</span>
              <span className="font-semibold text-foreground tabular-nums ml-4">
                {item.format !== false ? formatRupee(item.value || 0) : item.value}
              </span>
            </div>
          ))}
        </div>

        {/* Reductions */}
        {reductions.filter((item) => item.show).length > 0 && (
          <>
            <div className="bg-red-50/30 dark:bg-red-950/10 px-6 py-4 flex justify-between text-sm">
              <span className="text-red-700 dark:text-red-300 font-medium">Discount Applied</span>
              <span className="font-bold text-red-700 dark:text-red-300 tabular-nums">
                -{formatRupee(discountAmount || 0)}
              </span>
            </div>
          </>
        )}

        {/* Total - Prominent Desktop Style */}
        <div className="bg-primary/10 px-6 py-5 flex justify-between items-center border-t-2 border-primary/20">
          <span className="text-lg font-bold text-foreground">Total Amount Due</span>
          <span className="text-2xl font-bold text-primary tabular-nums">
            {formatRupee(totalAmount)}
          </span>
        </div>
      </div>

      {taxPercentage && (
        <div className="px-6 py-3 bg-muted/30 text-sm text-muted-foreground border-t border-border">
          <span className="inline-block mr-4">Tax Rate: <span className="font-semibold text-foreground">{taxPercentage}%</span></span>
          <span className="inline-block">GST Amount: <span className="font-semibold text-foreground">{formatRupee(gstAmount || 0)}</span></span>
        </div>
      )}
    </div>
  );
}
