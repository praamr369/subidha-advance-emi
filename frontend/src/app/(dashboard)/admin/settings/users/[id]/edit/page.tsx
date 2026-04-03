"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Receipt, Calendar } from "lucide-react";

import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection, DetailItem } from "@/components/ui/workspace";
import StatusBadge from "@/components/ui/status-badge";
import StatCard from "@/components/ui/StatCard";
import { apiFetch } from "@/lib/api";

type SubscriptionFinancialSummary = {
  paid_amount?: string | number | null;
  pending_amount?: string | number | null;
  waived_amount?: string | number | null;
  remaining_amount?: string | number | null;
};

type SubscriptionEmiRow = {
  id: number;
  month_no?: number | null;
  due_date?: string | null;
  amount?: string | number | null;
  status?: string | null;
};

type SubscriptionDetailRecord = {
  id: number;
  status?: string | null;
  total_amount?: string | number | null;
  monthly_amount?: string | number | null;
  tenure_months?: number | null;
  lucky_number?: number | null;
  product_name?: string | null;
  batch_code?: string | null;
  customer_name?: string | null;
  plan_type?: string | null;
  start_date?: string | null;
  financial_summary?: SubscriptionFinancialSummary | null;
  emis?: SubscriptionEmiRow[] | null;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load subscription details";
}

export default function PartnerSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<SubscriptionDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // Note: Scoped to partner via backend route policy
      const res = await apiFetch<SubscriptionDetailRecord>(`/partner/subscriptions/${params.id}/`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <LoadingBlock label="Loading subscription..." />;
  if (error) return <ErrorState title="Error" description={error} onRetry={loadData} />;
  if (!data) return <ErrorState title="Not Found" description="Subscription not found" />;

  const { financial_summary: fs } = data;

  return (
    <PortalPage
      title={`Subscription #${data.id}`}
      subtitle="Financial overview and EMI status for this customer contract."
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Subscriptions", href: "/partner/subscriptions" },
        { label: `#${data.id}` },
      ]}
      stats={[
        { label: "Status", value: data.status || "—", tone: data.status === "ACTIVE" ? "success" : "info" },
        { label: "Paid", value: `₹${fs?.paid_amount || '0.00'}`, tone: "success" },
        { label: "Pending", value: `₹${fs?.pending_amount || '0.00'}`, tone: "warning" }
      ]}
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Total Amount" value={`₹${data.total_amount}`} icon={<Receipt className="h-4 w-4" />} />
          <StatCard label="Monthly EMI" value={`₹${data.monthly_amount}`} icon={<Calendar className="h-4 w-4" />} />
          <StatCard label="Tenure" value={`${data.tenure_months} Months`} />
          <StatCard label="Lucky ID" value={data.lucky_number ? `#${String(data.lucky_number).padStart(2, '0')}` : "—"} tone="info" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <WorkspaceSection title="Contract Details" description="Core subscription parameters.">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Product" value={data.product_name} />
              <DetailItem label="Batch" value={data.batch_code || "—"} />
              <DetailItem label="Customer" value={data.customer_name} />
              <DetailItem label="Plan Type" value={data.plan_type} />
              <DetailItem label="Start Date" value={data.start_date ? new Date(data.start_date).toLocaleDateString() : "—"} />
              <DetailItem label="Status" value={<StatusBadge status={data.status} />} />
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Financial Summary" description="Current payment posture.">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Total Contract" value={`₹${data.total_amount}`} />
              <DetailItem label="Paid to Date" value={`₹${fs?.paid_amount || '0.00'}`} />
              <DetailItem label="Waived" value={`₹${fs?.waived_amount || '0.00'}`} />
              <DetailItem label="Outstanding" value={`₹${fs?.remaining_amount || '0.00'}`} />
            </div>
          </WorkspaceSection>
        </div>

        <WorkspaceSection title="EMI Schedule" description="Installment breakdown and payment status.">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Month</th>
                  <th className="px-6 py-3">Due Date</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {data.emis?.map((emi) => (
                  <tr key={emi.id} className="text-sm">
                    <td className="whitespace-nowrap px-6 py-4 font-medium">Month {emi.month_no}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">{emi.due_date || "—"}</td>
                    <td className="whitespace-nowrap px-6 py-4">₹{emi.amount}</td>
                    <td className="whitespace-nowrap px-6 py-4"><StatusBadge status={emi.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspaceSection>
      </div>
    </PortalPage>
  );
}
