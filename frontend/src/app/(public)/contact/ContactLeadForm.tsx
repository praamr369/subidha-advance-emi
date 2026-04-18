"use client";

import { useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import { submitPublicLead } from "@/lib/public-api";

export default function ContactLeadForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
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
        notes: message.trim(),
      });

      const referenceSuffix =
        typeof response.lead_id === "number" ? ` Reference #${response.lead_id}.` : "";

      setSuccessMessage(
        `${response.message || "Message submitted successfully."}${referenceSuffix}`
      );
      setName("");
      setPhone("");
      setEmail("");
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
    <section className="rounded-[2rem] border border-white/75 bg-white/82 p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.62)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Contact form
      </div>
      <h2 className="mt-3 text-xl font-semibold text-foreground">Send a message</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Ask about products, batch availability, or the monthly plan structure. Branch follow-up works best with a correct phone number.
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-foreground">Full name</span>
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter your full name"
            required
            className="h-11 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-foreground">Phone</span>
          <input
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="10-digit phone number"
            required
            pattern="[0-9]{10}"
            className="h-11 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
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
            className="h-11 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
          />
        </label>

        <label className="grid gap-2 lg:col-span-2">
          <span className="text-sm font-medium text-foreground">Message</span>
          <textarea
            name="message"
            rows={6}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell us what you want to buy, your preferred EMI comfort, or any Lucky Plan questions."
            required
            className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
          />
        </label>

        <div className="lg:col-span-2 flex flex-wrap gap-3">
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

