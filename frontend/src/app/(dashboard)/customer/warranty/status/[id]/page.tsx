"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type ClaimStatus = {
  id: number;
  defect_type: string;
  status: string;
  created_at: string;
  scheduled_date: string | null;
  technician_name: string | null;
  technician_phone: string | null;
  resolution_notes: string | null;
  estimated_completion: string | null;
};

const STEPS = [
  { key: "FILED", label: "Filed" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "APPROVED", label: "Approved" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
];

export default function WarrantyStatusPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ClaimStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/v1/warranty/claim-status/${id}/`)
      .then((d) => setData(d as ClaimStatus))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const currentStep = data ? STEPS.findIndex((s) => s.key === data.status) : -1;

  return (
    <ERPPageShell
      title={`Warranty Claim #${id}`}
      subtitle="Track your warranty service request"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Warranty", href: "/customer/warranty/check" },
        { label: `Claim #${id}` },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}

        {data && (
          <>
            <WorkspaceSection title="Claim Progress">
              <div className="flex items-center gap-0 overflow-x-auto pb-2">
                {STEPS.map((step, i) => (
                  <div key={step.key} className="flex items-center flex-shrink-0">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        i <= currentStep ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-500"
                      }`}>
                        {i < currentStep ? "✓" : i + 1}
                      </div>
                      <div className="text-xs mt-1 text-center w-14">{step.label}</div>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`h-0.5 w-8 mb-4 ${i < currentStep ? "bg-orange-500" : "bg-gray-200"}`} />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-center">
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200">
                  {data.status.replace(/_/g, " ")}
                </span>
              </div>
            </WorkspaceSection>

            <WorkspaceSection title="Claim Details">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">Defect Type</dt>
                  <dd className="font-medium mt-1">{data.defect_type?.replace(/_/g, " ")}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Filed On</dt>
                  <dd className="font-medium mt-1">{new Date(data.created_at).toLocaleDateString("en-IN")}</dd>
                </div>
                {data.scheduled_date && (
                  <div>
                    <dt className="text-gray-500">Scheduled</dt>
                    <dd className="font-medium mt-1">{new Date(data.scheduled_date).toLocaleDateString("en-IN")}</dd>
                  </div>
                )}
                {data.estimated_completion && (
                  <div>
                    <dt className="text-gray-500">Est. Completion</dt>
                    <dd className="font-medium mt-1">{new Date(data.estimated_completion).toLocaleDateString("en-IN")}</dd>
                  </div>
                )}
                {data.technician_name && (
                  <div className="col-span-2">
                    <dt className="text-gray-500">Technician</dt>
                    <dd className="font-medium mt-1">{data.technician_name} — {data.technician_phone}</dd>
                  </div>
                )}
                {data.resolution_notes && (
                  <div className="col-span-2">
                    <dt className="text-gray-500">Resolution Notes</dt>
                    <dd className="mt-1 text-gray-700 dark:text-gray-300">{data.resolution_notes}</dd>
                  </div>
                )}
              </dl>
            </WorkspaceSection>
          </>
        )}
      </div>
    </ERPPageShell>
  );
}
