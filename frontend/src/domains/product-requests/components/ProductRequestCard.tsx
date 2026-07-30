"use client";

import Link from "next/link";
import CustomerDetailsHover from "./CustomerDetailsHover";
import type { ProductRequestRecord } from "@/services/product-requests";

type Props = {
  request: ProductRequestRecord;
  showRequester?: boolean;
};

export default function ProductRequestCard({ request, showRequester }: Props) {
  const getRequestLink = (req: ProductRequestRecord): string => {
    const typePathMap: Record<string, string> = {
      DIRECT_SALE: "direct-sale",
      ADVANCE_EMI: "advance-emi",
      RENT: "rent",
      LEASE: "lease",
    };
    const typePath = typePathMap[req.request_type] || "direct-sale";
    return `/admin/requests/product-requests/${typePath}/${req.id}`;
  };

  const getTypeStyles = (type: string) => {
    const styles: Record<string, { bg: string; border: string; badge: string; text: string }> = {
      DIRECT_SALE: {
        bg: "bg-blue-50",
        border: "border-blue-200",
        badge: "bg-blue-100 text-blue-800",
        text: "text-blue-900",
      },
      ADVANCE_EMI: {
        bg: "bg-purple-50",
        border: "border-purple-200",
        badge: "bg-purple-100 text-purple-800",
        text: "text-purple-900",
      },
      RENT: {
        bg: "bg-orange-50",
        border: "border-orange-200",
        badge: "bg-orange-100 text-orange-800",
        text: "text-orange-900",
      },
      LEASE: {
        bg: "bg-teal-50",
        border: "border-teal-200",
        badge: "bg-teal-100 text-teal-800",
        text: "text-teal-900",
      },
    };
    return styles[type] || styles.DIRECT_SALE;
  };

  const statusColor =
    request.status === "APPROVED"
      ? "bg-emerald-50 border-emerald-200"
      : request.status === "REJECTED"
        ? "bg-red-50 border-red-200"
        : "bg-amber-50 border-amber-200";

  const typeStyles = getTypeStyles(request.request_type);

  return (
    <div className={`rounded-xl border p-4 shadow-sm transition hover:shadow-md hover:border-slate-300 ${statusColor}`}>
      <Link href={getRequestLink(request)} className="block h-full">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="text-xs font-semibold text-slate-500 uppercase">Product Request</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{request.product_name}</h3>
            <div className="mt-1 text-sm text-slate-600 cursor-pointer hover:underline">
              {request.requested_customer_name || request.customer_name || "Customer pending"}
            </div>
          </div>
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
            request.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
            request.status === "REJECTED" ? "bg-red-100 text-red-800" :
            request.status === "SUBMITTED" ? "bg-amber-100 text-amber-800" :
            "bg-blue-100 text-blue-800"
          }`}>{request.status}</span>
        </div>

        <div className="mt-4 grid gap-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs font-semibold text-slate-500">Type</span>
              <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${typeStyles.badge}`}>
                {request.request_type === "ADVANCE_EMI" ? "EMI" : request.request_type.replace(/_/g, " ")}
              </span>
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-500">Tenure</span>
              <p className="font-medium text-slate-900">{request.requested_tenure_months_snapshot ? `${request.requested_tenure_months_snapshot}mo` : "—"}</p>
            </div>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">Phone</span>
            <p className="font-medium text-slate-900">{request.requested_customer_phone || request.customer_phone || "—"}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">Submitted By</span>
            <p className="font-medium text-slate-900">{request.requester_username || "—"}</p>
          </div>
          {showRequester && (
            <div>
              <span className="text-xs font-semibold text-slate-500">Submitted</span>
              <p className="font-medium text-slate-900">{request.created_at ? new Date(request.created_at).toLocaleDateString() : "—"}</p>
            </div>
          )}
        </div>

        <div className="mt-3 border-t pt-2 text-xs text-slate-500">Click to review and approve/reject</div>
      </Link>
    </div>
  );
}
