"use client";

import { useState, type FormEvent } from "react";

import ActionButton from "@/components/ui/ActionButton";
import { submitPublicLead } from "@/lib/public-api";

const TOPIC_OPTIONS = [
  { value: "GENERAL", label: "General support" },
  { value: "PRODUCT", label: "Product enquiry" },
  { value: "LUCKY_PLAN", label: "Lucky Plan guidance" },
  { value: "RENT_LEASE", label: "Rent / Lease guidance" },
  { value: "DIRECT_SALE", label: "Direct sale / invoice" },
  { value: "DELIVERY", label: "Delivery / service support" },
] as const;

type SupportTopic = (typeof TOPIC_OPTIONS)[number]["value"];

function buildContactNotes(topic: SupportTopic, message: string): string {
  const topicLabel = TOPIC_OPTIONS.find((option) => option.value === topic)?.label ?? "General support";
  return [`Contact topic: ${topicLabel}`, message.trim() ? `Message: ${message.trim()}` : ""].filter(Boolean).join("\n");
}

export default function ContactLeadForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<SupportTopic>("GENERAL");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await submitPublicLead({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        interested_product: "",
        notes: buildContactNotes(topic, message),
      });

      const referenceSuffix =
        typeof response.lead_id === "number" ? ` Reference #${response.lead_id}.` : "";

      setSuccessMessage(
        `${response.message || "Message submitted successfully."}${referenceSuffix}`
      );
      setName("");
      setPhone("");
      setEmail("");
      setTopic("GENERAL");
      setMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit right now. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.62)] backdrop-blur">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Contact form
      </div>
      <h2 className="mt-3 text-xl font-semibold text-foreground">Send a message</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Ask about products, Lucky Plan, rent, lease, direct sale, documents, or delivery support. This form creates a public lead only; branch follow-up works best with a correct phone number.
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-6">
        <fieldset className="grid gap-4 lg:grid-cols-2">
          <legend className="mb-1 px-1 text-sm font-semibold text-foreground lg:col-span-2">How we can reach you</legend>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Full name</span>
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your full name"
              required
              disabled={loading}
              autoComplete="name"
              className="public-control-focus h-11 rounded-xl border border-border bg-background px-4 text-sm"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Phone</span>
            <input
              name="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit phone number"
              required
              pattern="[0-9]{10}"
              disabled={loading}
              autoComplete="tel"
              className="public-control-focus h-11 rounded-xl border border-border bg-background px-4 text-sm"
            />
          </label>

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium text-foreground">Email (optional)</span>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="If you prefer email follow-up"
              disabled={loading}
              autoComplete="email"
              className="public-control-focus h-11 rounded-xl border border-border bg-background px-4 text-sm"
            />
          </label>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="mb-1 px-1 text-sm font-semibold text-foreground">Support context</legend>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Topic</span>
            <select
              name="topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value as SupportTopic)}
              disabled={loading}
              className="public-control-focus h-11 rounded-xl border border-border bg-background px-4 text-sm"
            >
              {TOPIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Message</span>
            <textarea
              name="message"
              rows={6}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us what you want to buy, your preferred monthly comfort, branch visit need, or support question."
              required
              disabled={loading}
              className="public-control-focus rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </label>
        </fieldset>

        <div className="rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-muted)_78%,transparent)] px-4 py-3 text-xs leading-5 text-muted-foreground">
          Do not share OTPs, passwords, card PINs, full bank details, or private documents in this public form. Staff will guide secure document collection separately.
        </div>

        <div className="flex flex-wrap gap-3">
          <ActionButton type="submit" variant="primary" loading={loading} size="lg">
            {loading ? "Submitting..." : "Send message"}
          </ActionButton>
        </div>
      </form>

      {successMessage ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
    </section>
  );
}
