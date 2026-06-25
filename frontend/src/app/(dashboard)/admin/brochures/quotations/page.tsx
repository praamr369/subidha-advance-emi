"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Clipboard, Download, FileText, Plus, RefreshCw, Send } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import Modal from "@/components/ui/modal";
import {
  acceptBrochureQuotation,
  cancelBrochureQuotation,
  createBrochureQuotation,
  getBrochureQuotation,
  listBrochureQuotations,
  recalculateBrochureQuotation,
  regenerateBrochureQuotationPdf,
  rejectBrochureQuotation,
  sendBrochureQuotation,
  updateBrochureQuotation,
  type BrochureQuotation,
  type BrochureQuotationStatus,
  type BrochureQuotationType,
  type BrochureQuotationWriteLine,
} from "@/services/brochures";

const TYPES: BrochureQuotationType[] = ["RENT", "LEASE", "LUCKY_EMI", "DIRECT_SALE", "MIXED"];
const STATUSES: BrochureQuotationStatus[] = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"];

function money(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(numeric)
    : value;
}

function writableLine(line?: BrochureQuotation["lines"][number]): BrochureQuotationWriteLine {
  return {
    product_id: line?.product_id ?? null,
    product_code: line?.product_code ?? "",
    product_name: line?.product_name ?? "",
    description: line?.description ?? "",
    plan_type: line?.plan_type ?? "DIRECT_SALE",
    quantity: line?.quantity ?? 1,
    unit_price: line?.unit_price ?? "0.00",
    monthly_amount: line?.monthly_amount ?? "0.00",
    tenure_months: line?.tenure_months ?? null,
    security_deposit: line?.security_deposit ?? "0.00",
    discount_amount: line?.discount_amount ?? "0.00",
    availability_label: line?.availability_label ?? "Subject to confirmation",
    sort_order: line?.sort_order ?? 100,
  };
}

export default function BrochureQuotationsPage() {
  const [rows, setRows] = useState<BrochureQuotation[]>([]);
  const [selected, setSelected] = useState<BrochureQuotation | null>(null);
  const [lines, setLines] = useState<BrochureQuotationWriteLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<BrochureQuotationStatus | "">("");
  const [type, setType] = useState<BrochureQuotationType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [enquiryId] = useState<number | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const value = new URLSearchParams(window.location.search).get("enquiry_id");
    return value && /^\d+$/.test(value) ? Number(value) : undefined;
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({
    customer_name: "",
    phone: "",
    quotation_type: "DIRECT_SALE" as BrochureQuotationType,
    validity_date: "",
  });
  const [draftLines, setDraftLines] = useState<BrochureQuotationWriteLine[]>([writableLine()]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listBrochureQuotations({
        q,
        status,
        quotation_type: type,
        date_from: dateFrom,
        date_to: dateTo,
        enquiry_id: enquiryId,
        page_size: 100,
      });
      setRows(payload.results);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load quotations.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, enquiryId, q, status, type]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openDetail(id: number) {
    try {
      const quotation = await getBrochureQuotation(id);
      setSelected(quotation);
      setLines(quotation.lines.map(writableLine));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open quotation.");
    }
  }

  async function run(action: () => Promise<BrochureQuotation>) {
    setSaving(true);
    try {
      const quotation = await action();
      setSelected(quotation);
      setLines(quotation.lines.map(writableLine));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Quotation action failed.");
    } finally {
      setSaving(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Clipboard access was blocked.");
    }
  }

  function updateLine(index: number, changes: Partial<BrochureQuotationWriteLine>, target = lines) {
    const next = target.map((line, current) => current === index ? { ...line, ...changes } : line);
    if (target === lines) setLines(next);
    else setDraftLines(next);
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const quotation = await createBrochureQuotation({
        customer_name: draft.customer_name,
        phone: draft.phone,
        quotation_type: draft.quotation_type,
        validity_date: draft.validity_date || null,
        terms_text: "Final booking is subject to admin confirmation and stock availability.",
        lines: draftLines,
      });
      setCreateOpen(false);
      setDraft({ customer_name: "", phone: "", quotation_type: "DIRECT_SALE", validity_date: "" });
      setDraftLines([writableLine()]);
      await load();
      await openDetail(quotation.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create quotation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Marketing"
      title="Brochure Quotations"
      subtitle="Create and share non-financial quotation drafts. Acceptance records agreement in principle only; it creates no invoice, payment, contract, order, delivery, EMI, or stock reservation."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Brochures", href: "/admin/brochures" }, { label: "Quotations" }]}
      actions={[
        { href: "/admin/brochures", label: "Brochures", variant: "secondary" },
        { href: "/admin/brochures/settings", label: "Settings", variant: "secondary" },
        { href: "/admin/brochures/enquiries", label: "Enquiries", variant: "secondary" },
      ]}
      stats={[
        { label: "Visible quotations", value: rows.length },
        { label: "Draft", value: rows.filter((row) => row.status === "DRAFT").length },
        { label: "Sent", value: rows.filter((row) => row.status === "SENT").length },
      ]}
    >
      <div className="space-y-6">
        <ERPSectionShell title="Filters" actions={<button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> New quotation</button>}>
          <form onSubmit={(event) => { event.preventDefault(); void load(); }} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Quotation, customer, phone, product" className="h-10 rounded-xl border border-border px-3 xl:col-span-2" />
            <select value={status} onChange={(event) => setStatus(event.target.value as BrochureQuotationStatus | "")} className="h-10 rounded-xl border border-border px-3"><option value="">All statuses</option>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={type} onChange={(event) => setType(event.target.value as BrochureQuotationType | "")} className="h-10 rounded-xl border border-border px-3"><option value="">All types</option>{TYPES.map((value) => <option key={value}>{value}</option>)}</select>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 rounded-xl border border-border px-3" />
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 rounded-xl border border-border px-3" />
            <button className="h-10 rounded-xl border border-border px-4 font-semibold">Apply</button>
          </form>
        </ERPSectionShell>

        {error ? <ERPErrorState title="Quotation action failed" description={error} onRetry={() => void load()} /> : null}

        <ERPSectionShell title="Quotation register" actions={<button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Refresh</button>}>
          {loading ? <ERPLoadingState label="Loading quotations..." /> : null}
          {!loading && rows.length === 0 ? <ERPEmptyState title="No quotations found" description="Create a draft manually or from a brochure enquiry." /> : null}
          {!loading && rows.length ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-[1150px] divide-y divide-border text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr>{["Quotation", "Customer", "Phone", "Type", "Payable now", "Monthly", "Status", "Valid until", "Created", "Actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-border bg-card">
                  {rows.map((row) => <tr key={row.id}>
                    <td className="px-3 py-3 font-semibold">{row.quotation_no}</td>
                    <td className="px-3 py-3">{row.customer_name}<div className="text-xs text-muted-foreground">{row.location || "—"}</div></td>
                    <td className="px-3 py-3">{row.phone}</td>
                    <td className="px-3 py-3">{row.quotation_type}</td>
                    <td className="px-3 py-3">{money(row.total_payable_now)}</td>
                    <td className="px-3 py-3">{money(row.recurring_monthly_total)}</td>
                    <td className="px-3 py-3">{row.status}</td>
                    <td className="px-3 py-3">{row.validity_date || "—"}</td>
                    <td className="px-3 py-3">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-3 py-3"><button type="button" onClick={() => void openDetail(row.id)} className="rounded-lg border border-border px-3 py-2 font-semibold">View / edit</button></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          ) : null}
        </ERPSectionShell>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New quotation draft">
        <form onSubmit={createDraft} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input required value={draft.customer_name} onChange={(event) => setDraft({ ...draft, customer_name: event.target.value })} placeholder="Customer name" className="h-10 rounded-xl border border-border px-3" />
            <input required value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="Phone" className="h-10 rounded-xl border border-border px-3" />
            <select value={draft.quotation_type} onChange={(event) => setDraft({ ...draft, quotation_type: event.target.value as BrochureQuotationType })} className="h-10 rounded-xl border border-border px-3">{TYPES.map((value) => <option key={value}>{value}</option>)}</select>
            <input type="date" value={draft.validity_date} onChange={(event) => setDraft({ ...draft, validity_date: event.target.value })} className="h-10 rounded-xl border border-border px-3" />
          </div>
          {draftLines.map((line, index) => <LineEditor key={index} line={line} onChange={(changes) => updateLine(index, changes, draftLines)} onRemove={draftLines.length > 1 ? () => setDraftLines(draftLines.filter((_, current) => current !== index)) : undefined} />)}
          <button type="button" onClick={() => setDraftLines([...draftLines, writableLine()])} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Add line</button>
          <div className="flex justify-end"><button disabled={saving} className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground">{saving ? "Creating..." : "Create draft"}</button></div>
        </form>
      </Modal>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.quotation_no ?? "Quotation"}>
        {selected ? <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm"><span>Customer</span><input disabled={selected.status !== "DRAFT"} value={selected.customer_name} onChange={(event) => setSelected({ ...selected, customer_name: event.target.value })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
            <label className="space-y-1 text-sm"><span>Phone</span><input disabled={selected.status !== "DRAFT"} value={selected.phone} onChange={(event) => setSelected({ ...selected, phone: event.target.value })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
            <label className="space-y-1 text-sm"><span>Valid until</span><input disabled={selected.status !== "DRAFT"} type="date" value={selected.validity_date ?? ""} onChange={(event) => setSelected({ ...selected, validity_date: event.target.value || null })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
            <label className="space-y-1 text-sm"><span>Expected delivery</span><input disabled={selected.status !== "DRAFT"} type="date" value={selected.expected_delivery_date ?? ""} onChange={(event) => setSelected({ ...selected, expected_delivery_date: event.target.value || null })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
            <label className="space-y-1 text-sm"><span>Delivery charge</span><input disabled={selected.status !== "DRAFT"} type="number" min="0" step="0.01" value={selected.delivery_charge} onChange={(event) => setSelected({ ...selected, delivery_charge: event.target.value })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
            <label className="space-y-1 text-sm"><span>Quotation discount</span><input disabled={selected.status !== "DRAFT"} type="number" min="0" step="0.01" value={selected.discount_amount} onChange={(event) => setSelected({ ...selected, discount_amount: event.target.value })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
          </div>
          {lines.map((line, index) => <LineEditor key={index} line={line} disabled={selected.status !== "DRAFT"} onChange={(changes) => updateLine(index, changes)} onRemove={selected.status === "DRAFT" && lines.length > 1 ? () => setLines(lines.filter((_, current) => current !== index)) : undefined} />)}
          {selected.status === "DRAFT" ? <button type="button" onClick={() => setLines([...lines, writableLine()])} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Add line</button> : null}
          <div className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-3">
            <div><div className="text-xs text-muted-foreground">Payable now</div><div className="font-semibold">{money(selected.total_payable_now)}</div></div>
            <div><div className="text-xs text-muted-foreground">Recurring monthly</div><div className="font-semibold">{money(selected.recurring_monthly_total)}</div></div>
            <div><div className="text-xs text-muted-foreground">Grand / projected</div><div className="font-semibold">{money(selected.grand_total)}</div></div>
          </div>
          <label className="block space-y-1 text-sm"><span>Terms</span><textarea disabled={selected.status !== "DRAFT"} rows={3} value={selected.terms_text} onChange={(event) => setSelected({ ...selected, terms_text: event.target.value })} className="w-full rounded-xl border border-border p-3" /></label>
          <label className="block space-y-1 text-sm"><span>Internal note</span><textarea disabled={selected.status !== "DRAFT"} rows={3} value={selected.internal_note} onChange={(event) => setSelected({ ...selected, internal_note: event.target.value })} className="w-full rounded-xl border border-border p-3" /></label>
          {selected.status_history?.length ? <ol className="space-y-2">{selected.status_history.map((entry) => <li key={entry.id} className="rounded-xl border border-border p-3 text-sm"><strong>{entry.from_status ? `${entry.from_status} → ` : ""}{entry.to_status}</strong><div className="text-muted-foreground">{entry.note || "No note"} · {new Date(entry.created_at).toLocaleString()}</div></li>)}</ol> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {selected.pdf_url ? <a href={selected.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 font-semibold"><Download className="h-4 w-4" /> PDF</a> : null}
            <button type="button" onClick={() => void copy(selected.public_url)} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 font-semibold"><Clipboard className="h-4 w-4" /> Public link</button>
            <button type="button" onClick={() => void copy(selected.whatsapp_message)} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 font-semibold"><Send className="h-4 w-4" /> WhatsApp</button>
            <button disabled={saving} onClick={() => void run(() => regenerateBrochureQuotationPdf(selected.id))} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 font-semibold"><FileText className="h-4 w-4" /> Regenerate PDF</button>
            {selected.status === "DRAFT" ? <>
              <button disabled={saving} onClick={() => void run(() => updateBrochureQuotation(selected.id, { customer_name: selected.customer_name, phone: selected.phone, validity_date: selected.validity_date, expected_delivery_date: selected.expected_delivery_date, delivery_charge: selected.delivery_charge, discount_amount: selected.discount_amount, terms_text: selected.terms_text, internal_note: selected.internal_note, lines }))} className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground">Save draft</button>
              <button disabled={saving} onClick={() => void run(() => recalculateBrochureQuotation(selected.id))} className="rounded-xl border border-border px-4 py-2 font-semibold">Recalculate</button>
              <button disabled={saving} onClick={() => void run(() => sendBrochureQuotation(selected.id))} className="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white">Send</button>
              <button disabled={saving} onClick={() => void run(() => cancelBrochureQuotation(selected.id))} className="rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-700">Cancel</button>
            </> : null}
            {selected.status === "SENT" ? <>
              <button disabled={saving} onClick={() => void run(() => acceptBrochureQuotation(selected.id))} className="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white">Accept in principle</button>
              <button disabled={saving} onClick={() => void run(() => rejectBrochureQuotation(selected.id))} className="rounded-xl border border-border px-4 py-2 font-semibold">Reject</button>
              <button disabled={saving} onClick={() => void run(() => cancelBrochureQuotation(selected.id))} className="rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-700">Cancel</button>
            </> : null}
          </div>
        </div> : null}
      </Modal>
    </ERPPageShell>
  );
}

function LineEditor({ line, onChange, onRemove, disabled = false }: { line: BrochureQuotationWriteLine; onChange: (changes: Partial<BrochureQuotationWriteLine>) => void; onRemove?: () => void; disabled?: boolean }) {
  return <div className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-4">
    <input disabled={disabled} required value={line.product_name} onChange={(event) => onChange({ product_name: event.target.value })} placeholder="Product name" className="h-10 rounded-xl border border-border px-3 md:col-span-2" />
    <input disabled={disabled} type="number" min="1" value={line.product_id ?? ""} onChange={(event) => onChange({ product_id: event.target.value ? Number(event.target.value) : null })} placeholder="Product ID (optional)" className="h-10 rounded-xl border border-border px-3" />
    <select disabled={disabled} value={line.plan_type} onChange={(event) => onChange({ plan_type: event.target.value as BrochureQuotationWriteLine["plan_type"] })} className="h-10 rounded-xl border border-border px-3">{TYPES.filter((value) => value !== "MIXED").map((value) => <option key={value}>{value}</option>)}</select>
    <input disabled={disabled} type="number" min="1" value={line.quantity} onChange={(event) => onChange({ quantity: Number(event.target.value) })} placeholder="Quantity" className="h-10 rounded-xl border border-border px-3" />
    <input disabled={disabled} type="number" min="0" step="0.01" value={line.unit_price} onChange={(event) => onChange({ unit_price: event.target.value })} placeholder="Sale/unit price" className="h-10 rounded-xl border border-border px-3" />
    <input disabled={disabled} type="number" min="0" step="0.01" value={line.monthly_amount} onChange={(event) => onChange({ monthly_amount: event.target.value })} placeholder="Monthly amount" className="h-10 rounded-xl border border-border px-3" />
    <input disabled={disabled} type="number" min="1" value={line.tenure_months ?? ""} onChange={(event) => onChange({ tenure_months: event.target.value ? Number(event.target.value) : null })} placeholder="Tenure months" className="h-10 rounded-xl border border-border px-3" />
    <input disabled={disabled} type="number" min="0" step="0.01" value={line.security_deposit} onChange={(event) => onChange({ security_deposit: event.target.value })} placeholder="Security deposit" className="h-10 rounded-xl border border-border px-3" />
    <input disabled={disabled} type="number" min="0" step="0.01" value={line.discount_amount} onChange={(event) => onChange({ discount_amount: event.target.value })} placeholder="Line discount" className="h-10 rounded-xl border border-border px-3" />
    <input disabled={disabled} value={line.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Description" className="h-10 rounded-xl border border-border px-3 md:col-span-2" />
    {onRemove ? <button type="button" onClick={onRemove} className="rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Remove line</button> : null}
  </div>;
}
