"use client";

import Link from "next/link";
import { HelpCircle, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import CustomerPageShell, {
  CPageCard,
  CPageSection,
  CPageStats,
  CPageStat,
  CPageTabs,
} from "@/components/layout/CustomerPageShell";
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
  return new Date(t).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const TABS = [
  { value: "open" as SupportTicketTab, label: "Open" },
  { value: "waiting_customer" as SupportTicketTab, label: "My Turn" },
  { value: "resolved" as SupportTicketTab, label: "Resolved" },
];

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
      setError(e instanceof Error ? e.message : "Unable to load support tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(tab); }, [load, tab]);

  return (
    <CustomerPageShell
      title="Support"
      subtitle="Raise and track requests with the shop team"
      actions={
        <Link
          href={ROUTES.customer.supportNew}
          className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
        >
          <Plus className="size-3.5" />
          New Request
        </Link>
      }
    >
      {/* Filter tabs */}
      <CPageSection>
        <CPageTabs tabs={TABS} active={tab} onChange={(v) => { setTab(v); void load(v); }} />
      </CPageSection>

      {loading ? <ERPLoadingState label="Loading tickets…" /> : null}

      {!loading && error ? (
        <ERPErrorState title="Could not load tickets" description={error} onRetry={() => void load(tab)} />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState
          title="No tickets"
          description={
            tab === "open"
              ? "You have no open support requests. Tap '+ New Request' to raise one."
              : tab === "waiting_customer"
                ? "No requests are waiting for your reply."
                : "No resolved tickets yet."
          }
          icon={<HelpCircle className="h-10 w-10 text-muted-foreground/40" />}
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <>
          <CPageStats>
            <CPageStat label="Tickets" value={count} />
          </CPageStats>

          <CPageSection title="Your requests">
            <div className="space-y-3">
              {rows.map((r) => (
                <CPageCard key={r.id} href={`${ROUTES.customer.support}/${r.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className="font-mono text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {r.ticket_no}
                        </span>
                        <ERPStatusBadge status={r.status} />
                      </div>
                      <p className="text-sm font-semibold text-foreground leading-snug">{r.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.category.replaceAll("_", " ")} · {formatDt(r.updated_at)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <ERPStatusBadge status={r.priority} label={r.priority.replaceAll("_", " ")} hideIcon />
                    </div>
                  </div>
                </CPageCard>
              ))}
            </div>
          </CPageSection>
        </>
      ) : null}
    </CustomerPageShell>
  );
}
