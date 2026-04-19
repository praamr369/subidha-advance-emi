import type { Metadata } from "next";
import Link from "next/link";

import CtaBanner from "@/components/public/CtaBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { ROUTES } from "@/lib/routes";
import ContactLeadForm from "./ContactLeadForm";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact Subidha Furniture, Asansol. Send an enquiry about products, batches, and Lucky Plan monthly plans.",
};

export default async function ContactPage() {
  const profile = await getResolvedPublicBusinessProfile();
  const contactEmail = (profile.support_email || "").trim();
  const contactPhone = (profile.support_phone || "").trim();
  const contactAddress = (profile.address_text || "").trim();
  const businessHours = (profile.business_hours || "").trim();
  const mapUrl = (profile.map_url || "").trim();

  return (
    <PublicPageShell
      title="Contact"
      subtitle="Ask about products, active batches, and monthly plan comfort. The branch can guide you through enrollment after your enquiry."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Contact" },
      ]}
      actions={[
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
        { label: "Products", href: ROUTES.public.products, variant: "secondary" },
      ]}
    >
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-6">
          <div className="rounded-[2rem] border border-white/75 bg-white/82 p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.62)]">
            <SectionHeader
              eyebrow="Branch"
              title="Visit Subidha Furniture"
              description="Asansol, West Bengal"
            />
            {contactAddress ? (
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {contactAddress}
              </p>
            ) : null}
            <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
              {contactPhone ? (
                <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">
                  Phone: {contactPhone}
                </div>
              ) : null}
              {contactEmail ? (
                <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">
                  Email: {contactEmail}
                </div>
              ) : null}
              {businessHours ? (
                <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">
                  Hours: {businessHours}
                </div>
              ) : null}
              {mapUrl ? (
                <Link
                  href={mapUrl}
                  className="rounded-xl border border-white/75 bg-white/70 px-4 py-3 transition hover:bg-white"
                >
                  Open map
                </Link>
              ) : null}
              {!contactPhone && !contactEmail ? (
                <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">
                  Contact details are provided by the branch during follow-up.
                </div>
              ) : null}
            </div>
            {profile.resolved_whatsapp_link ? (
              <div className="mt-4">
                <Link
                  href={profile.resolved_whatsapp_link}
                  className="inline-flex h-10 items-center rounded-xl border border-slate-950/10 bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5"
                >
                  WhatsApp the branch
                </Link>
              </div>
            ) : null}
            <p className="mt-5 text-sm leading-7 text-muted-foreground">
              For in-person product browsing, enrollment assistance, and Lucky Plan clarification, visit the branch with your product preference and phone number.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/75 bg-white/82 p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.62)]">
            <SectionHeader
              eyebrow="Existing customers"
              title="Already enrolled?"
              description="Use your account for subscriptions, payments, and support guidance."
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={ROUTES.public.login}
                className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                Login
              </Link>
              <Link
                href={ROUTES.public.register}
                className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                Register
              </Link>
            </div>
          </div>
        </section>

        <ContactLeadForm />
      </section>

      <CtaBanner
        title="Want to include a product in your enquiry?"
        description="Browse the live catalogue first, then open Apply to carry the product context directly into the enquiry."
        actions={[
          { href: ROUTES.public.products, label: "Browse products", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Apply", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
