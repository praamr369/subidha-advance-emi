"use client";

import { useEffect, useState } from "react";
import { Download, MessageCircle } from "lucide-react";
import { useParams } from "next/navigation";

import { getPublicQuotation, type PublicBrochureQuotation } from "@/services/brochures";

function money(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(numeric)
    : value;
}

export default function PublicQuotationPage() {
  const params = useParams<{ token: string }>();
  const [quotation, setQuotation] = useState<PublicBrochureQuotation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.token) return;
    let active = true;
    getPublicQuotation(params.token)
      .then((payload) => {
        if (active) setQuotation(payload);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load quotation.");
      });
    return () => { active = false; };
  }, [params.token]);

  if (error) {
    return <main className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"><h1 className="text-xl font-semibold">Quotation unavailable</h1><p className="mt-2">{error}</p></div></main>;
  }
  if (!quotation) {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-muted-foreground">Loading quotation...</main>;
  }

  const phone = quotation.business_contact.phone?.replace(/[^\d+]/g, "") ?? "";
  const whatsapp = phone ? `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(`Hello, I am reviewing quotation ${quotation.quotation_no}.`)}` : "";

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div><div className="text-sm font-semibold uppercase tracking-wide text-primary">{quotation.business_contact.business_name || "Subidha Furniture"}</div><h1 className="mt-2 text-3xl font-bold">Customer quotation</h1><p className="mt-2 text-muted-foreground">{quotation.quotation_no} · {quotation.quotation_type.replaceAll("_", " ")}</p></div>
          <div className="rounded-2xl bg-muted px-4 py-3 text-sm"><div><strong>Status:</strong> {quotation.status}</div><div><strong>Valid until:</strong> {quotation.validity_date || "Not specified"}</div><div><strong>Customer:</strong> {quotation.customer_display_name}</div></div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4"><h2 className="text-xl font-semibold">Products and plan</h2></div>
        <div className="overflow-x-auto">
          <table className="min-w-[850px] w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr>{["Product", "Plan", "Qty", "Sale / unit", "Monthly", "Tenure", "Deposit", "Discount", "Total"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{quotation.lines.map((line, index) => <tr key={`${line.product_code}-${index}`}><td className="px-4 py-4"><div className="font-semibold">{line.product_name}</div><div className="text-xs text-muted-foreground">{line.description || line.availability_label}</div></td><td className="px-4 py-4">{line.plan_type}</td><td className="px-4 py-4">{line.quantity}</td><td className="px-4 py-4">{money(line.unit_price)}</td><td className="px-4 py-4">{money(line.monthly_amount)}</td><td className="px-4 py-4">{line.tenure_months ?? "—"}</td><td className="px-4 py-4">{money(line.security_deposit)}</td><td className="px-4 py-4">{money(line.discount_amount)}</td><td className="px-4 py-4 font-semibold">{money(line.line_total)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-[1fr_360px]">
        <div className="rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-semibold">Terms</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{quotation.terms_text || "Please contact our admin team for final terms."}</p><div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium leading-6 text-amber-950">{quotation.disclaimer}</div></div>
        <div className="rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-semibold">Amount summary</h2><dl className="mt-4 space-y-3 text-sm">{[["Subtotal", quotation.subtotal_amount], ["Discount", quotation.discount_amount], ["Delivery charge", quotation.delivery_charge], ["Security deposit", quotation.security_deposit_total], ["Payable now", quotation.total_payable_now], ["Recurring monthly", quotation.recurring_monthly_total], ["Grand / projected", quotation.grand_total]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold">{money(value)}</dd></div>)}</dl><div className="mt-6 flex flex-col gap-2">{quotation.pdf_url ? <a href={quotation.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground"><Download className="h-4 w-4" /> Download PDF</a> : null}{whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 font-semibold"><MessageCircle className="h-4 w-4" /> Contact on WhatsApp</a> : null}</div></div>
      </section>
    </main>
  );
}
