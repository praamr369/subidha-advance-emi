"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Download, Send } from "lucide-react";
import { useParams } from "next/navigation";

import {
  createPublicBrochureEnquiry,
  listPublicBrochureProducts,
  type BrochureEnquiryPlan,
  type PublicBrochureProducts,
} from "@/services/brochures";

const PLANS: Array<{ value: BrochureEnquiryPlan; label: string }> = [
  { value: "RENT", label: "Rent" },
  { value: "LEASE", label: "Lease" },
  { value: "LUCKY_EMI", label: "Lucky EMI" },
  { value: "DIRECT_SALE", label: "Direct sale" },
  { value: "NOT_SURE", label: "Not sure yet" },
];

export default function PublicBrochurePage() {
  const params = useParams<{ token: string }>();
  const token = String(params.token || "");
  const [brochure, setBrochure] = useState<PublicBrochureProducts | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [enquiryNo, setEnquiryNo] = useState("");
  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    location: "",
    preferred_plan: "NOT_SURE" as BrochureEnquiryPlan,
    message: "",
    expected_delivery_date: "",
  });

  useEffect(() => {
    void listPublicBrochureProducts(token)
      .then((payload) => setBrochure(payload))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to open this brochure."))
      .finally(() => setLoading(false));
  }, [token]);

  function toggleProduct(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await createPublicBrochureEnquiry(token, {
        ...form,
        expected_delivery_date: form.expected_delivery_date || null,
        products: [...selected].map((productId) => ({
          product_id: productId,
          requested_quantity: 1,
          preferred_plan: form.preferred_plan,
        })),
      });
      setEnquiryNo(response.enquiry_no);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit your enquiry.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="mx-auto max-w-6xl px-5 py-16">Loading brochure…</main>;
  if (!brochure) return <main className="mx-auto max-w-3xl px-5 py-16"><h1 className="text-2xl font-bold">Brochure unavailable</h1><p className="mt-3 text-muted-foreground">{error}</p></main>;

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-5 py-12">
      <header className="rounded-3xl border border-border bg-card p-7">
        <div className="text-sm font-semibold uppercase tracking-wide text-primary">{brochure.brochure_no}</div>
        <h1 className="mt-2 text-3xl font-bold">{brochure.title}</h1>
        <p className="mt-3 text-muted-foreground">Select any products you are interested in. This enquiry does not reserve stock or create an order, invoice, payment, or contract.</p>
        {brochure.pdf_url ? <a href={brochure.pdf_url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold"><Download className="h-4 w-4" /> Download brochure PDF</a> : null}
      </header>

      <section>
        <h2 className="text-xl font-bold">Products</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {brochure.products.map((product) => (
            <label key={product.id} className={`cursor-pointer rounded-2xl border p-5 ${selected.has(product.id) ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleProduct(product.id)} className="mt-1 h-4 w-4 accent-primary" />
                <div><div className="font-semibold">{product.name}</div><div className="text-xs text-muted-foreground">{product.product_code} · {product.category}</div><p className="mt-2 text-sm text-muted-foreground">{product.short_description}</p></div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-7">
        <h2 className="text-xl font-bold">Send an enquiry</h2>
        {enquiryNo ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5" /> Thank you. Our team will contact you soon.</div>
            <div className="mt-2 text-sm">Your enquiry number is <strong>{enquiryNo}</strong>.</div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
            <input required maxLength={120} placeholder="Your name" value={form.customer_name} onChange={(event) => setForm({ ...form, customer_name: event.target.value })} className="h-11 rounded-xl border border-border px-4" />
            <input required maxLength={30} inputMode="tel" placeholder="Phone number" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="h-11 rounded-xl border border-border px-4" />
            <input maxLength={180} placeholder="Location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="h-11 rounded-xl border border-border px-4" />
            <select required value={form.preferred_plan} onChange={(event) => setForm({ ...form, preferred_plan: event.target.value as BrochureEnquiryPlan })} className="h-11 rounded-xl border border-border px-4">
              {PLANS.map((plan) => <option key={plan.value} value={plan.value}>{plan.label}</option>)}
            </select>
            <label className="space-y-1 text-sm"><span>Expected delivery date (optional)</span><input type="date" value={form.expected_delivery_date} onChange={(event) => setForm({ ...form, expected_delivery_date: event.target.value })} className="h-11 w-full rounded-xl border border-border px-4" /></label>
            <textarea rows={4} maxLength={2000} placeholder="Tell us what you need" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} className="rounded-xl border border-border p-4 md:col-span-2" />
            {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
            <button disabled={submitting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60 md:w-fit"><Send className="h-4 w-4" /> {submitting ? "Sending…" : "Submit enquiry"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
