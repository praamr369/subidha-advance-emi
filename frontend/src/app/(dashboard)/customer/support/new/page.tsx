"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState, useRef } from "react";
import CustomerPageShell from "@/components/layout/CustomerPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { ROUTES } from "@/lib/routes";
import { listCustomerSubscriptions } from "@/services/customer";
import {
  createCustomerSupportTicket,
  uploadCustomerSupportTicketAttachment,
  type SupportTicketCategory,
} from "@/services/support";
import Link from "next/link";
import { Wrench, Sparkles, Hammer, Settings2, Image as ImageIcon, X } from "lucide-react";

const SERVICE_PRESETS = [
  {
    id: "polishing",
    icon: Sparkles,
    title: "Furniture Polishing",
    subtitle: "PU, Melamine, buffing & scratch touchups",
    category: "SERVICE_REQUEST" as SupportTicketCategory,
    subject: "[Service] Furniture Polishing & Refinishing Request",
    description: `Service Requested: Furniture Polishing & Refinishing\nPolish Type: (Matte / Glossy / PU / Melamine / Natural Teak)\nItems / Affected Areas:\nCondition / Scratches / Stains:\nPreferred Date & Time:`,
  },
  {
    id: "installation",
    icon: Hammer,
    title: "Assembly & Installation",
    subtitle: "Bed/wardrobe setup, wall mounting & dismantling",
    category: "SERVICE_REQUEST" as SupportTicketCategory,
    subject: "[Service] Furniture Assembly & Installation Request",
    description: `Service Requested: Furniture Assembly & Installation\nItem(s) to Assemble/Install:\nLocation / Room:\nSpecial Tools / Wall Mounting Needed:\nPreferred Date & Time:`,
  },
  {
    id: "repairs",
    icon: Wrench,
    title: "Repairs & Refurbishment",
    subtitle: "Structural fix, upholstery, sagging foam & joints",
    category: "SERVICE_REQUEST" as SupportTicketCategory,
    subject: "[Service] Furniture Repair & Refurbishment Request",
    description: `Service Requested: Repair & Refurbishment\nProblem Description:\nStructural / Joinery / Upholstery issue:\nUrgency Level: (Normal / Urgent)\nPreferred Service Date:`,
  },
  {
    id: "hardware",
    icon: Settings2,
    title: "Hardware Replacement",
    subtitle: "Hinges, telescopic channels, bed hydraulics & locks",
    category: "SERVICE_REQUEST" as SupportTicketCategory,
    subject: "[Service] Hardware & Fittings Replacement Request",
    description: `Service Requested: Hardware Replacement\nHardware Component: (Soft-close hinge / Drawer channel / Bed hydraulic lift / Lock / Handle)\nQuantity Needed:\nProblem Details:\nPreferred Service Date:`,
  },
];

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
  const categoryParam = (searchParams.get("category") || "").trim() as SupportTicketCategory;

  const [subs, setSubs] = useState<{ id: number; label: string }[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [category, setCategory] = useState<SupportTicketCategory>(categoryParam || "GENERAL_SUPPORT");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [preferredContactTime, setPreferredContactTime] = useState("");
  const [linkSubId, setLinkSubId] = useState<string>(subParam);
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleSelectPreset(preset: typeof SERVICE_PRESETS[number]) {
    if (activePreset === preset.id) {
      setActivePreset(null);
      return;
    }
    setActivePreset(preset.id);
    setCategory(preset.category);
    setSubject(preset.subject);
    setDescription(preset.description);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const newFiles = Array.from(e.target.files);
    // filter for size <= 10MB
    const valid = newFiles.filter((f) => f.size <= 10 * 1024 * 1024);
    setPhotos((prev) => [...prev, ...valid].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

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

      // Upload photos if any
      if (photos.length > 0) {
        for (const photo of photos) {
          try {
            await uploadCustomerSupportTicketAttachment(ticket.id, photo);
          } catch {
            // non-fatal for main ticket
          }
        }
      }

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
        <div className="space-y-6">
          {/* Quick Service Presets */}
          <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-bold text-foreground">Quick Service & Maintenance Presets</h2>
              <p className="text-xs text-muted-foreground">Select a service preset to quickly pre-fill details for our workshop & technician team</p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {SERVICE_PRESETS.map((p) => {
                const Icon = p.icon;
                const isSelected = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                        : "border-border bg-background hover:bg-muted/40 hover:border-primary/40 text-foreground"
                    }`}
                  >
                    <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold">{p.title}</div>
                      <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{p.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          {error ? (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div>
            <label htmlFor="f-what-is-this-about" className="block text-xs font-semibold text-muted-foreground mb-1.5">
              What is this about? *
            </label>
            <select id="f-what-is-this-about"
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
              <label htmlFor="f-related-contract-optional" className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Related contract (optional)
              </label>
              <select id="f-related-contract-optional"
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
            <label htmlFor="f-subject" className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Subject *
            </label>
            <input id="f-subject"
              className={inputCls}
              value={subject}
              onChange={(ev) => setSubject(ev.target.value)}
              maxLength={200}
              placeholder="Brief summary of your issue"
            />
          </div>

          <div>
            <label htmlFor="f-description" className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Description *
            </label>
            <textarea id="f-description"
              className={`${inputCls} min-h-[120px] resize-none`}
              value={description}
              onChange={(ev) => setDescription(ev.target.value)}
              placeholder="Describe what happened in detail — include dates, amounts, or contract numbers if relevant"
            />
          </div>

          <div>
            <label htmlFor="f-best-time-to-call-optional" className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Best time to call (optional)
            </label>
            <input id="f-best-time-to-call-optional"
              className={inputCls}
              value={preferredContactTime}
              onChange={(ev) => setPreferredContactTime(ev.target.value)}
              placeholder="e.g. Weekdays after 6pm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Photos / Item Pictures (optional)
            </label>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  multiple
                  className="hidden"
                  id="f-photo-upload"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border bg-background px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground hover:border-primary/60 transition"
                >
                  <ImageIcon className="size-4 text-primary" />
                  <span>Attach photos (max 5)</span>
                </button>
                <span className="text-[11px] text-muted-foreground">Upload photos of item condition, defect, or space</span>
              </div>

              {photos.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {photos.map((file, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm"
                    >
                      <ImageIcon className="size-3.5 text-muted-foreground" />
                      <span className="max-w-[150px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="text-muted-foreground hover:text-red-500"
                        aria-label="Remove"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
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
        </div>
      ) : null}
    </CustomerPageShell>
  );
}
