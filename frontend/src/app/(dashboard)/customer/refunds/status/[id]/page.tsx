"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type RefundStatus = {
  id: number;
  status: string;
  reason: string;
  created_at: string;
  refund_amount: number;
  deduction_amount: number;
  estimated_completion: string | null;
  notes: string;
};

const STATUS_STEPS = [
  { key: "REQUESTED", label: "Requested" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "PICKUP_SCHEDULED", label: "Pickup Scheduled" },
  { key: "ITEM_RECEIVED", label: "Item Received" },
  { key: "PROCESSING", label: "Processing Refund" },
  { key: "COMPLETED", label: "Completed" },
];

function stepIndex(status: string) {
  return STATUS_STEPS.findIndex((s) => s.key === status);
}

export default function RefundStatusPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RefundStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/v1/refunds/status/${id}/`)
      .then((d) => setData(d as RefundStatus))
      .catch(() => setError("Could not load refund status."))
      .finally(() => setLoading(false));
  }, [id]);

  const currentStep = data ? stepIndex(data.status) : -1;

  return (
    <ERPPageShell
      title={`Return #${id} — Status`}
      subtitle="Track your return and refund progress"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Returns", href: "/customer/refunds/history" },
        { label: `Return #${id}` },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {loading && <div className="text-center py-8 text-gray-500">Loading status...</div>}
        {error && <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 rounded-lg">{error}</div>}

        {data && (
          <>
            <WorkspaceSection title="Progress">
              <div className="relative">
                <div className="flex items-center justify-between">
                  {STATUS_STEPS.map((step, i) => (
                    <div key={step.key} className="flex flex-col items-center flex-1">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                          i <= currentStep
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white dark:bg-gray-800 border-gray-300 text-gray-400"
                        }`}
                      >
                        {i < currentStep ? "✓" : i + 1}
                      </div>
                      <div className="text-xs mt-1 text-center w-16 hidden sm:block">{step.label}</div>
                      {i < STATUS_STEPS.length - 1 && (
                        <div className={`absolute top-4 h-0.5 ${i < currentStep ? "bg-blue-600" : "bg-gray-200"}`}
                          style={{ left: `${(i + 0.5) * (100 / STATUS_STEPS.length)}%`, width: `${100 / STATUS_STEPS.length}%` }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 text-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                  {data.status.replace(/_/g, " ")}
                </span>
              </div>
            </WorkspaceSection>

            <WorkspaceSection title="Refund Details">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">Return Reason</dt>
                  <dd className="font-medium mt-1">{data.reason.replace(/_/g, " ")}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Requested On</dt>
                  <dd className="font-medium mt-1">{new Date(data.created_at).toLocaleDateString("en-IN")}</dd>
                </div>
                {data.refund_amount > 0 && (
                  <div>
                    <dt className="text-gray-500">Refund Amount</dt>
                    <dd className="font-medium mt-1 text-green-600">₹{data.refund_amount.toLocaleString("en-IN")}</dd>
                  </div>
                )}
                {data.deduction_amount > 0 && (
                  <div>
                    <dt className="text-gray-500">Deductions</dt>
                    <dd className="font-medium mt-1 text-orange-600">₹{data.deduction_amount.toLocaleString("en-IN")}</dd>
                  </div>
                )}
                {data.estimated_completion && (
                  <div className="col-span-2">
                    <dt className="text-gray-500">Estimated Completion</dt>
                    <dd className="font-medium mt-1">{new Date(data.estimated_completion).toLocaleDateString("en-IN")}</dd>
                  </div>
                )}
                {data.notes && (
                  <div className="col-span-2">
                    <dt className="text-gray-500">Notes</dt>
                    <dd className="mt-1 text-gray-700 dark:text-gray-300">{data.notes}</dd>
                  </div>
                )}
              </dl>
            </WorkspaceSection>

            <WorkspaceSection title="Need Help?">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Refunds are processed within 2–14 business days. For urgent queries contact support.
              </p>
              <a href="/customer/support" className="inline-block mt-2 text-sm text-blue-600 underline">Contact Support →</a>
            </WorkspaceSection>
          </>
        )}
      </div>
    </ERPPageShell>
  );
}
