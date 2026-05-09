"use client";

import { useEffect, useMemo, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import { apiFetch } from "@/lib/api";

type BusinessEvent = {
  id: number;
  event_type: string;
  customer: number | null;
  subscription: number | null;
  contract_reference: number | null;
  payment: number | null;
  occurred_at: string;
  payload: Record<string, unknown>;
};

type EventResponse =
  | BusinessEvent[]
  | {
      results?: BusinessEvent[];
    };

function normalize(payload: EventResponse): BusinessEvent[] {
  return Array.isArray(payload) ? payload : payload.results ?? [];
}

export default function AdminAuditEventsPage() {
  const [rows, setRows] = useState<BusinessEvent[]>([]);
  const [selected, setSelected] = useState<BusinessEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eventType, setEventType] = useState("");
  const [customer, setCustomer] = useState("");
  const [subscription, setSubscription] = useState("");
  const [contract, setContract] = useState("");
  const [payment, setPayment] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (eventType.trim()) params.set("event_type", eventType.trim());
      if (customer.trim()) params.set("customer", customer.trim());
      if (subscription.trim()) params.set("subscription", subscription.trim());
      if (contract.trim()) params.set("contract", contract.trim());
      if (payment.trim()) params.set("payment", payment.trim());
      if (dateFrom.trim()) params.set("date_from", dateFrom.trim());
      if (dateTo.trim()) params.set("date_to", dateTo.trim());
      const query = params.toString();
      const payload = await apiFetch<EventResponse>(`/admin/audit/events/${query ? `?${query}` : ""}`);
      const next = normalize(payload);
      setRows(next);
      if (selected) {
        const match = next.find((row) => row.id === selected.id) ?? null;
        setSelected(match);
      }
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load business events.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stat = useMemo(() => String(rows.length), [rows.length]);

  return (
    <PortalPage
      title="Business Events"
      subtitle="Append-only business event timeline for financial and operational auditability."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Audit Events" }]}
      stats={[{ label: "Visible Events", value: stat }]}
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <input className="h-10 rounded-lg border border-border px-3 text-sm" placeholder="Event type" value={eventType} onChange={(e) => setEventType(e.target.value)} />
            <input className="h-10 rounded-lg border border-border px-3 text-sm" placeholder="Customer ID" value={customer} onChange={(e) => setCustomer(e.target.value)} />
            <input className="h-10 rounded-lg border border-border px-3 text-sm" placeholder="Subscription ID" value={subscription} onChange={(e) => setSubscription(e.target.value)} />
            <input className="h-10 rounded-lg border border-border px-3 text-sm" placeholder="Contract Ref ID" value={contract} onChange={(e) => setContract(e.target.value)} />
            <input className="h-10 rounded-lg border border-border px-3 text-sm" placeholder="Payment ID" value={payment} onChange={(e) => setPayment(e.target.value)} />
            <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" onClick={() => void load()}>
              Apply Filters
            </button>
            <input className="h-10 rounded-lg border border-border px-3 text-sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input className="h-10 rounded-lg border border-border px-3 text-sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          {loading ? <LoadingBlock label="Loading business events..." /> : null}
          {!loading && error ? <ErrorState title="Unable to load events" description={error} onRetry={() => void load()} /> : null}
          {!loading && !error && rows.length === 0 ? <EmptyState title="No events found" description="No business events match the current filters." /> : null}

          {!loading && !error && rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="border-b border-border px-3 py-2">Event</th>
                    <th className="border-b border-border px-3 py-2">Refs</th>
                    <th className="border-b border-border px-3 py-2">Occurred At</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(row)}>
                      <td className="border-b border-border px-3 py-2 text-sm">
                        <div className="font-medium">{row.event_type}</div>
                        <div className="text-xs text-muted-foreground">#{row.id}</div>
                      </td>
                      <td className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                        C:{row.customer ?? "—"} S:{row.subscription ?? "—"} P:{row.payment ?? "—"}
                      </td>
                      <td className="border-b border-border px-3 py-2 text-sm">{new Date(row.occurred_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <aside className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Event Detail Drawer</h2>
          {!selected ? (
            <p className="mt-4 text-sm text-muted-foreground">Select an event to inspect full payload.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <div><span className="font-medium">Event:</span> {selected.event_type}</div>
              <div><span className="font-medium">Occurred:</span> {new Date(selected.occurred_at).toLocaleString()}</div>
              <pre className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted p-3 text-xs">
                {JSON.stringify(selected.payload ?? {}, null, 2)}
              </pre>
            </div>
          )}
        </aside>
      </div>
    </PortalPage>
  );
}

