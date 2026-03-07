"use client";

import { useState } from "react";

import PortalPage from "@/components/ui/portal-page";
import { API_BASE_URL } from "@/lib/constants";

export default function ApplyPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/public/leads/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          phone: formData.get("phone"),
          city: formData.get("city"),
          interested_product: formData.get("interested_product"),
          preferred_emi_amount: formData.get("preferred_emi_amount"),
          notes: formData.get("notes"),
        }),
      });

      if (!response.ok) throw new Error("Unable to submit application");
      setStatus("Application submitted successfully.");
      event.currentTarget.reset();
    } catch {
      setStatus("Unable to submit right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalPage title="Apply" subtitle="Quick lead capture for Lucky Plan.">
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, maxWidth: 700 }}>
        <input name="name" placeholder="Name" required />
        <input name="phone" placeholder="Phone" required pattern="[0-9]{10}" />
        <input name="city" placeholder="City / Area" />
        <input name="interested_product" placeholder="Interested Product" />
        <input name="preferred_emi_amount" type="number" placeholder="Preferred EMI Amount" />
        <textarea name="notes" placeholder="Notes" rows={4} />
        <button type="submit" disabled={loading}>{loading ? "Submitting..." : "Submit"}</button>
      </form>
      {status ? <p>{status}</p> : null}
    </PortalPage>
  );
}
