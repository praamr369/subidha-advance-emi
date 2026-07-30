"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import CustomerPageShell from "@/components/layout/CustomerPageShell";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { ROUTES } from "@/lib/routes";
import { listCustomerSubscriptions } from "@/services/customer";
import { createCustomerSupportTicket, type SupportTicketCategory } from "@/services/support";
import Link from "next/link";

const CATEGORIES: { value: SupportTicketCategory; label: string }[] = [
  { value: "EMI_QUERY", label: "EMI / advance plan" },
  { value: "PAYMENT_ISSUE", label: "Payment issue" },
  { value: "DELIVERY_ISSUE", label: "Delivery problem" },
  { value: "PRODUCT_DAMAGE", label: "Product damage" },
  { value: "RETURN_REQUEST", label: "Return request" },
  { value: "WARRANTY_CLAIM", label: "Warranty claim" },
  { value: "RENT_QUERY", label: "Rent query" },
  { value: "LEASE_QUERY", label: "Lease query" },
  { value: "DIRECT_SALE_QUERY", label: "Direct sale" },
  { value: "LUCKY_DRAW_QUERY", label: "Lucky draw" },
  { value: "DOCUMENT_CORRECTION", label: "Document correction" },
  { value: "CUSTOMER_PROFILE_UPDATE", label: "Profile update" },
  { value: "SERVICE_REQUEST", label: "Service request" },
  { value: "GENERAL_SUPPORT", label: "General support" },
];

const inputCls = "w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition";

export default function CustomerSupportNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subParam = (searchParams.get("subscription") || "").trim();

  const [subs, setSubs] = useState<{ id: number; label: string }[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [category, setCategory] = useState<SupportTicketCategory>("GENERAL_SUPPORT");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [preferredContactTime, setPreferredContactTime] = useState("");
  const [linkSubId, setLinkSubId] = useState<string>(subParam);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await listCustomerSubscriptions();
        if (cancelled) return;
        setSubs(res.results.map((s) => ({
          id: s.id,
          label: `${s.subscription_number || `SUB-${s.id}`} · ${s.product_name || "Plan"}`,
        })));
      } catch {
        if (!cancelled) setSubs([]);
      } finally {
        if (!cancelled) setSubsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setError("Subject and description are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const parsed = Number(linkSubId);
      const payload: Parameters<typeof createCustomerSupportTicket>[0] = {
        category,
        subject: subject.trim(),
        description: description.trim(),
        preferred_contact_time: preferredContactTime.trim(),
      };
      if (Number.isFinite(parsed) && parsed > 0) {
        payload.link_type = "subscription";
        payload.link_object_id = parsed;
      }
      const ticket = await createCustomerSupportTicket(payload);
      router.push(`${ROUTES.customer.support}/${ticket.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create ticket.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CustomerPageShell
      title="New Support Request"
      subtitle="Describe your issue and we'll create a ticket for you"
      backHref={ROUTES.customer.support}
      backLabel="Support"
    >
      {subsLoading ? <ERPLoadingState label="Loading your subscriptions…" /> : null}

      {!subsLoading ? (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          {error ? (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              What is this about? *
            </label>
            <select
              className={inputCls}
              value={category}
              onChange={(ev) => setCategory(ev.target.value as SupportTicketCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {subs.length > 0 ? (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Related contract (optional)
              </label>
              <select
                className={inputCls}
                value={linkSubId}
                onChange={(ev) => setLinkSubId(ev.target.value)}
              >
                <option value="">No specific contract</option>
                {subs.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.label}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Subject *
            </label>
            <input
              className={inputCls}
              value={subject}
              onChange={(ev) => setSubject(ev.target.value)}
              maxLength={200}
              placeholder="Brief summary of your issue"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Description *
            </label>
            <textarea
              className={`${inputCls} min-h-[120px] resize-none`}
              value={description}
              onChange={(ev) => setDescription(ev.target.value)}
              placeholder="Describe what happened in detail — include dates, amounts, or contract numbers if relevant"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Best time to call (optional)
            </label>
            <input
              className={inputCls}
              value={preferredContactTime}
              onChange={(ev) => setPreferredContactTime(ev.target.value)}
              placeholder="e.g. Weekdays after 6pm"
            />
          </div>

          <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            Note: This form does not change your EMI schedule, payments, or contracts. A TKT-… number will be assigned to track this request.
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 hover:opacity-90 transition"
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
            <Link
              href={ROUTES.customer.support}
              className="rounded-2xl border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Cancel
            </Link>
          </div>
        </form>
      ) : null}
    </CustomerPageShell>
  );
}
