"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import Modal from "@/components/ui/modal";
import {
  closeBrochureEnquiry,
  getBrochureEnquiry,
  listBrochureEnquiries,
  markBrochureEnquiryContacted,
  updateBrochureEnquiry,
  type BrochureEnquiry,
} from "@/services/brochures";

export default function BrochureEnquiriesPage() {
  const [rows, setRows] = useState<BrochureEnquiry[]>([]);
  const [selected, setSelected] = useState<BrochureEnquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [followUpDue, setFollowUpDue] = useState(false);
  const [possibleDuplicate, setPossibleDuplicate] = useState(false);
  const [crmLinkStatus, setCrmLinkStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listBrochureEnquiries({
        q,
        status,
        preferred_plan: plan,
        date_from: dateFrom,
        follow_up_due: followUpDue || undefined,
        possible_duplicate: possibleDuplicate || undefined,
        crm_link_status: crmLinkStatus,
        page_size: 100,
      });
      setRows(payload.results);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load brochure enquiries.");
    } finally {
      setLoading(false);
    }
  }, [crmLinkStatus, dateFrom, followUpDue, plan, possibleDuplicate, q, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openDetail(id: number) {
    try { setSelected(await getBrochureEnquiry(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to open enquiry."); }
  }

  async function action(run: () => Promise<BrochureEnquiry>) {
    setSaving(true);
    try {
      const updated = await run();
      setSelected(updated);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update enquiry.");
    } finally {
      setSaving(false);
    }
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  return (
    <ERPPageShell
      title="Brochure Enquiries"
      subtitle="Follow up customer interest captured from public brochure links. Enquiries do not create orders, contracts, invoices, payments, EMI schedules, or stock reservations."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Brochures", href: "/admin/brochures" }, { label: "Enquiries" }]}
      actions={[{ href: "/admin/brochures", label: "Brochure Generator", variant: "secondary" }, { href: "/admin/brochures/settings", label: "Product Settings", variant: "secondary" }]}
      stats={[{ label: "Visible enquiries", value: rows.length }, { label: "New", value: rows.filter((row) => row.status === "NEW").length }, { label: "High priority", value: rows.filter((row) => row.priority === "HIGH").length }]}
    >
      <div className="space-y-6">
        <ERPSectionShell title="Filters">
          <form onSubmit={apply} className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, phone, product" className="h-10 rounded-xl border border-border px-3 md:col-span-2" />
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border border-border px-3"><option value="">All statuses</option>{["NEW", "CONTACTED", "QUOTED", "CONVERTED", "CLOSED", "LOST"].map((value) => <option key={value}>{value}</option>)}</select>
            <select value={plan} onChange={(event) => setPlan(event.target.value)} className="h-10 rounded-xl border border-border px-3"><option value="">All plans</option>{["RENT", "LEASE", "LUCKY_EMI", "DIRECT_SALE", "NOT_SURE"].map((value) => <option key={value}>{value}</option>)}</select>
            <select value={crmLinkStatus} onChange={(event) => setCrmLinkStatus(event.target.value)} className="h-10 rounded-xl border border-border px-3"><option value="">All CRM states</option>{["NOT_ATTEMPTED", "LINKED", "PARTIAL", "SKIPPED", "FAILED"].map((value) => <option key={value}>{value}</option>)}</select>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 min-w-0 rounded-xl border border-border px-2" />
            <label className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm"><input type="checkbox" checked={followUpDue} onChange={(event) => setFollowUpDue(event.target.checked)} /> Follow-up due</label>
            <label className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm"><input type="checkbox" checked={possibleDuplicate} onChange={(event) => setPossibleDuplicate(event.target.checked)} /> Possible duplicate</label>
            <button className="h-10 rounded-xl bg-primary px-4 font-semibold text-primary-foreground">Apply</button>
          </form>
        </ERPSectionShell>
        {error ? <ERPErrorState title="Enquiry action failed" description={error} onRetry={() => void load()} /> : null}
        <ERPSectionShell title="Follow-up queue" actions={<button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Refresh</button>}>
          {loading ? <ERPLoadingState label="Loading enquiries…" /> : null}
          {!loading && rows.length === 0 ? <ERPEmptyState title="No enquiries found" description="New public brochure enquiries will appear here." /> : null}
          {!loading && rows.length ? (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-[1200px] divide-y divide-border text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr>{["Enquiry", "Customer", "Phone", "Plan", "Products", "Status", "CRM", "Follow-up", "Priority", "Assigned", "Created", "Actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-border bg-card">{rows.map((row) => <tr key={row.id}><td className="px-3 py-3 font-semibold">{row.enquiry_no}{row.is_possible_duplicate ? <span className="mt-1 block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Possible duplicate</span> : null}</td><td className="px-3 py-3">{row.customer_name}<div className="text-xs text-muted-foreground">{row.location || "—"}</div></td><td className="px-3 py-3">{row.phone}</td><td className="px-3 py-3">{row.preferred_plan}</td><td className="max-w-xs px-3 py-3">{row.products.map((product) => product.brochure_product_name).join(", ") || "General enquiry"}</td><td className="px-3 py-3">{row.status}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.crm_link_status === "LINKED" ? "bg-emerald-100 text-emerald-900" : row.crm_link_status === "FAILED" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>{row.crm_link_status}</span></td><td className="px-3 py-3">{row.follow_up_at ? new Date(row.follow_up_at).toLocaleString() : "—"}</td><td className="px-3 py-3">{row.priority}</td><td className="px-3 py-3">{row.assigned_to_name || "Unassigned"}</td><td className="px-3 py-3">{new Date(row.created_at).toLocaleString()}</td><td className="px-3 py-3"><button type="button" onClick={() => void openDetail(row.id)} className="rounded-lg border border-border px-3 py-2 font-semibold">View</button></td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </ERPSectionShell>
      </div>
      <Modal open={Boolean(selected)} title={selected ? `${selected.enquiry_no} · ${selected.customer_name}` : "Enquiry"} onClose={() => setSelected(null)} size="xl">
        {selected ? <div className="max-h-[75vh] space-y-5 overflow-y-auto">
          <div className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-2"><div><strong>Phone:</strong> {selected.phone}</div><div><strong>Location:</strong> {selected.location || "—"}</div><div><strong>Plan:</strong> {selected.preferred_plan}</div><div><strong>Brochure:</strong> {selected.brochure_no} ({selected.brochure_type})</div><div className="md:col-span-2"><strong>Message:</strong> {selected.message || "—"}</div></div>
          {selected.is_possible_duplicate ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Possible duplicate of {selected.duplicate_of_enquiry_no || `enquiry ${selected.duplicate_of}`}</strong><p className="mt-1">{selected.duplicate_reason}</p></div> : null}
          <div><h3 className="font-semibold">Products</h3><ul className="mt-2 space-y-2">{selected.products.map((product) => <li key={product.id} className="rounded-xl border border-border p-3">{product.brochure_product_name} × {product.requested_quantity}<div className="text-xs text-muted-foreground">{product.brochure_product_code}</div></li>)}</ul></div>
          <div className="rounded-xl border border-border p-4 text-sm"><strong>CRM status:</strong> {selected.crm_link_status}<p className="mt-1 text-muted-foreground">{selected.crm_link_message || "No CRM linkage message."}</p><div className="mt-2">Party {selected.crm_summary.party_id ?? "pending"} · Lead {selected.crm_summary.lead_id ?? "pending"} · Interaction {selected.crm_summary.interaction_id ?? "pending"}</div>{selected.crm_summary.warning ? <p className="mt-2 text-amber-700">{selected.crm_summary.warning}</p> : null}</div>
          <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm"><span>Status</span><select value={selected.status} onChange={(event) => setSelected({ ...selected, status: event.target.value as BrochureEnquiry["status"] })} className="h-10 w-full rounded-xl border border-border px-3">{["NEW", "CONTACTED", "QUOTED", "CONVERTED", "CLOSED", "LOST"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="space-y-1 text-sm"><span>Priority</span><select value={selected.priority} onChange={(event) => setSelected({ ...selected, priority: event.target.value as BrochureEnquiry["priority"] })} className="h-10 w-full rounded-xl border border-border px-3">{["LOW", "NORMAL", "HIGH"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="space-y-1 text-sm"><span>Assign internal user ID</span><input type="number" min="1" value={selected.assigned_to ?? ""} onChange={(event) => setSelected({ ...selected, assigned_to: event.target.value ? Number(event.target.value) : null })} placeholder="Leave blank for unassigned" className="h-10 w-full rounded-xl border border-border px-3" /></label><label className="space-y-1 text-sm"><span>Follow-up date/time</span><input type="datetime-local" value={selected.follow_up_at ? selected.follow_up_at.slice(0, 16) : ""} onChange={(event) => setSelected({ ...selected, follow_up_at: event.target.value ? new Date(event.target.value).toISOString() : null })} className="h-10 w-full rounded-xl border border-border px-3" /></label><div className="text-sm"><strong>Last contacted:</strong> {selected.last_contacted_at ? new Date(selected.last_contacted_at).toLocaleString() : "Never"}</div><label className="space-y-1 text-sm md:col-span-2"><span>Internal note</span><textarea rows={4} value={selected.internal_note} onChange={(event) => setSelected({ ...selected, internal_note: event.target.value })} className="w-full rounded-xl border border-border p-3" /></label></div>
          {selected.status_history?.length ? <div><h3 className="font-semibold">Enquiry history</h3><ol className="mt-2 space-y-2">{selected.status_history.map((entry) => <li key={entry.id} className="rounded-xl border border-border p-3 text-sm"><div className="font-semibold">{entry.event_type} · {entry.from_status ? `${entry.from_status} → ` : ""}{entry.to_status}</div><div className="text-muted-foreground">{entry.note || "No note"} · {new Date(entry.created_at).toLocaleString()} {entry.changed_by_name ? `· ${entry.changed_by_name}` : ""}</div></li>)}</ol></div> : null}
          <div className="flex flex-wrap justify-end gap-2"><button disabled={saving} onClick={() => void action(() => markBrochureEnquiryContacted(selected.id))} className="rounded-xl border border-border px-4 py-2 font-semibold">Mark contacted</button><button disabled={saving} onClick={() => void action(() => closeBrochureEnquiry(selected.id, { status: "CLOSED", internal_note: selected.internal_note }))} className="rounded-xl border border-border px-4 py-2 font-semibold">Close</button><button disabled={saving} onClick={() => void action(() => closeBrochureEnquiry(selected.id, { status: "LOST", internal_note: selected.internal_note }))} className="rounded-xl border border-border px-4 py-2 font-semibold">Mark lost</button><button disabled={saving} onClick={() => void action(() => updateBrochureEnquiry(selected.id, { status: selected.status, priority: selected.priority, assigned_to: selected.assigned_to, follow_up_at: selected.follow_up_at, internal_note: selected.internal_note }))} className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground">Save changes</button></div>
        </div> : null}
      </Modal>
    </ERPPageShell>
  );
}
