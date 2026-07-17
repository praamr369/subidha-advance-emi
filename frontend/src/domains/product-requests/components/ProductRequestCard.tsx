"use client";

import Link from "next/link";
import PublicProductMedia from "@/components/public/PublicProductMedia";
import StatusBadge from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { ProductRequestRecord } from "@/services/product-requests";

type Props = {
  request: ProductRequestRecord;
  href?: string;
  className?: string;
  showRequester?: boolean;
};

export default function ProductRequestCard({
  request,
  href,
  className,
  showRequester = false,
}: Props) {
  const link = href || `/admin/requests/product-requests/${request.id}`;

  const inner = (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <div className="flex gap-4">
        <PublicProductMedia src={request.product_image} alt="Product" sizes="100px" className="h-24 w-24 rounded-lg" />
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">{request.product_name}</h3>
              <p className="text-sm text-slate-600">{request.customer_name || request.requested_customer_name}</p>
            </div>
            <StatusBadge status={request.status} />
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-700">
            <div>Type: {request.request_type}</div>
            <div>Tenure: {request.requested_tenure_months_snapshot ? `${request.requested_tenure_months_snapshot}mo` : "—"}</div>
            {showRequester && <div>Requester: {request.requester_username}</div>}
          </div>
        </div>
      </div>
    </div>
  );

  return href ? <Link href={link}>{inner}</Link> : inner;
}
