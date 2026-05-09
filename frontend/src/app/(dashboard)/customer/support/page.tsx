"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import { MobileSafeTable } from "@/components/ui/operations";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  listCustomerSupportTickets,
  type SupportTicketListItem,
  type SupportTicketTab,
} from "@/services/support";

function formatDt(v: string | null | undefined): string {
  if (!v) return "—";
  const t = Date.parse(v);
  if (Number.isNaN(t)) return v;
  return new Date(t).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  return fallback;
}

export default function CustomerSupportHubPage() {
  const [tab, setTab] = useState<SupportTicketTab>("open");
  const [rows, setRows] = useState<SupportTicketListItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: SupportTicketTab) => {
    setLoading(true);
    try {
      const res = await listCustomerSupportTickets(t);
      setRows(res.results);
      setCount(res.count);
      setError(null);
    } catch (e) {
      setRows([]);
      setCount(0);
      setError(errMsg(e, "Unable to load support tickets."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  return (
    <PortalPage
      eyebrow="Customer Support"
      title="Support & requests"
      subtitle="Raise structured requests (TKT numbers) for EMI, rent, lease, delivery, payments, and general help. Operational records are never changed from this desk."
      breadcrumbs={[
        { label: "Customer", href: ROUTES.customer.dashboard },
        { label: "Support" },
      ]}
      actions={[
        { href: ROUTES.customer.supportNew, label: "Create New Request", variant: "primary" },
        { href: ROUTES.customer.payments, label: "Payments", variant: "secondary" },
      ]}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["open", "Open requests"],
              ["waiting_customer", "Waiting for my reply"],
              ["resolved", "Resolved"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-11 rounded-full border px-4 py-2 text-sm touch-manipulation ${
                tab === key
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border bg-[var(--surface-card)] text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? <LoadingBlock label="Loading tickets…" /> : null}
        {!loading && error ? (
          <ErrorState title="Could not load tickets" description={error} onRetry={() => void load(tab)} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No tickets in this view"
            description="Create a request to start a tracked conversation with the shop team."
            action={<ActionButton href={ROUTES.customer.supportNew}>Create request</ActionButton>}
          />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <WorkspaceSection
            title="Your tickets"
            description={`${count} total in this filter · ticket numbers look like TKT-FY-#####`}
          >
            <MobileSafeTable className="border-border">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-[var(--surface-muted)] text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Ticket</th>
                    <th className="px-3 py-3">Subject</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3">Priority</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Updated</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-3 font-mono text-xs">{r.ticket_no}</td>
                      <td className="px-3 py-3">{r.subject}</td>
                      <td className="px-3 py-3 text-muted-foreground">{r.category.replaceAll("_", " ")}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={r.priority} label={r.priority.replaceAll("_", " ")} hideIcon />
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDt(r.updated_at)}</td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`${ROUTES.customer.support}/${r.id}`}
                          className="inline-flex min-h-11 min-w-[4.5rem] items-center justify-end text-primary underline-offset-2 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MobileSafeTable>
          </WorkspaceSection>
        ) : null}
      </div>
    </PortalPage>
  );
}
