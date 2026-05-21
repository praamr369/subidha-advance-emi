"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import FormActions from "@/components/ui/FormActions";
import FormSection from "@/components/ui/FormSection";
import { ROUTES } from "@/lib/routes";
import { listCustomerSubscriptions } from "@/services/customer";
import {
  createCustomerSupportTicket,
  type SupportTicketCategory,
} from "@/services/support";

const CATEGORIES: { value: SupportTicketCategory; label: string }[] = [
  { value: "EMI_QUERY", label: "EMI / advance plan" },
  { value: "PAYMENT_ISSUE", label: "Payment" },
  { value: "DELIVERY_ISSUE", label: "Delivery" },
  { value: "PRODUCT_DAMAGE", label: "Product damage" },
  { value: "RETURN_REQUEST", label: "Return" },
  { value: "WARRANTY_CLAIM", label: "Warranty" },
  { value: "RENT_QUERY", label: "Rent" },
  { value: "LEASE_QUERY", label: "Lease" },
  { value: "DIRECT_SALE_QUERY", label: "Direct sale" },
  { value: "LUCKY_DRAW_QUERY", label: "Lucky draw" },
  { value: "DOCUMENT_CORRECTION", label: "Document correction" },
  { value: "CUSTOMER_PROFILE_UPDATE", label: "Profile update" },
  { value: "SERVICE_REQUEST", label: "Service request" },
  { value: "GENERAL_SUPPORT", label: "General" },
];

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
    (async () => {
      try {
        const res = await listCustomerSubscriptions();
        if (cancelled) return;
        setSubs(
          res.results.map((s) => ({
            id: s.id,
            label: `${s.subscription_number || `SUB-${s.id}`} · ${s.product_name || "Plan"}`,
          }))
        );
      } catch {
        if (!cancelled) setSubs([]);
      } finally {
        if (!cancelled) setSubsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    <ERPPageShell
      eyebrow="Customer Support"
      title="New support request"
      subtitle="You will receive a ticket number (TKT-…). This form does not change EMI, payments, or contracts."
      breadcrumbs={[
        { label: "Customer", href: ROUTES.customer.dashboard },
        { label: "Support", href: ROUTES.customer.support },
        { label: "New" },
      ]}
      actions={[{ href: ROUTES.customer.support, label: "Back to list", variant: "secondary" }]}
      headerMode="erp"
    >
      {subsLoading ? <ERPLoadingState label="Loading your subscriptions…" /> : null}
      {!subsLoading ? (
        <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6">
          {error ? <ERPErrorState title="Unable to submit" description={error} /> : null}
          <FormSection title="Request" description="Choose a category and describe the issue clearly.">
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Category</span>
              <select
                className="w-full rounded-lg border border-border bg-[var(--surface-card)] px-3 py-2"
                value={category}
                onChange={(ev) => setCategory(ev.target.value as SupportTicketCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Related subscription (optional)</span>
              <select
                className="w-full rounded-lg border border-border bg-[var(--surface-card)] px-3 py-2"
                value={linkSubId}
                onChange={(ev) => setLinkSubId(ev.target.value)}
              >
                <option value="">None</option>
                {subs.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Subject</span>
              <input
                className="w-full rounded-lg border border-border bg-[var(--surface-card)] px-3 py-2"
                value={subject}
                onChange={(ev) => setSubject(ev.target.value)}
                maxLength={200}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Description</span>
              <textarea
                className="min-h-[120px] w-full rounded-lg border border-border bg-[var(--surface-card)] px-3 py-2"
                value={description}
                onChange={(ev) => setDescription(ev.target.value)}
                placeholder="Describe what happened in detail"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Preferred contact time (optional)</span>
              <input
                className="w-full rounded-lg border border-border bg-[var(--surface-card)] px-3 py-2"
                value={preferredContactTime}
                onChange={(ev) => setPreferredContactTime(ev.target.value)}
                placeholder="e.g. Weekdays after 6pm"
              />
            </label>
            <p className="rounded-lg border border-dashed border-border bg-[var(--surface-muted)]/50 px-3 py-2 text-xs text-muted-foreground">
              Attachments: file upload is not enabled in this build; describe any evidence in the text above.
            </p>
          </FormSection>
          <FormActions
            submitLabel="Submit request"
            submitLoadingLabel="Submitting…"
            submitting={submitting}
            cancel={{ label: "Cancel", href: ROUTES.customer.support }}
          />
        </form>
      ) : null}
    </ERPPageShell>
  );
}
