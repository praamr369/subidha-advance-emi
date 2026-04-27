"use client";

import { useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { getAdminPartnerPaymentRequests } from "@/services/phase5-control";

type PartnerPaymentRow = {
  id: number;
  partner_name?: string;
  customer_name?: string;
  subscription_number?: string;
  amount?: string;
  payment_method?: string;
  payment_date?: string;
  reference_no?: string;
};

export default function AdminPartnerPaymentRequestsPage() {
  const [rows, setRows] = useState<PartnerPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = (await getAdminPartnerPaymentRequests()) as { results?: PartnerPaymentRow[] };
        setRows(response.results ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load partner payment requests.");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  return (
    <PortalPage
      title="Partner Payment Requests"
      subtitle="Admin review queue for partner-submitted payment requests."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Partner Operations" },
        { label: "Payment Requests" },
      ]}
    >
      {loading ? <LoadingBlock label="Loading partner payment requests..." /> : null}
      {error ? <ErrorState title="Queue unavailable" description={error} /> : null}
      {!loading && !error ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="min-w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Partner</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Subscription</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Payment date</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-muted-foreground" colSpan={7}>
                    No pending partner payment requests.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">{row.partner_name || "—"}</td>
                    <td className="px-3 py-2">{row.customer_name || "—"}</td>
                    <td className="px-3 py-2">{row.subscription_number || "—"}</td>
                    <td className="px-3 py-2">{row.amount || "0.00"}</td>
                    <td className="px-3 py-2">{row.payment_method || "—"}</td>
                    <td className="px-3 py-2">{row.payment_date || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <ActionButton href={ROUTES.admin.paymentsCreate} size="sm" variant="secondary">
                          Process
                        </ActionButton>
                        <ActionButton href={ROUTES.admin.reconciliation} size="sm" variant="outline">
                          Approve / Reject
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </PortalPage>
  );
}
