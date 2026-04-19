import Link from "next/link";

import BrandLockup from "@/components/public/BrandLockup";
import { brandConfig } from "@/config/brand";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { ROUTES } from "@/lib/routes";

const footerLinks = [
  { href: ROUTES.public.products, label: "Products" },
  { href: ROUTES.public.luckyPlan, label: "Lucky Plan" },
  { href: ROUTES.public.apply, label: "Apply" },
  { href: ROUTES.public.winnerHistory, label: "Winner History" },
  { href: ROUTES.public.contact, label: "Contact" },
  { href: ROUTES.public.blog, label: "Blog" },
  { href: ROUTES.public.login, label: "Login" },
  { href: ROUTES.public.register, label: "Register" },
];

export default async function PublicFooter() {
  const profile = await getResolvedPublicBusinessProfile();
  const hasSocial = Boolean(
    (profile.facebook_url || "").trim() ||
      (profile.instagram_url || "").trim() ||
      (profile.youtube_url || "").trim()
  );
  const hasContact = Boolean(
    (profile.support_phone || "").trim() ||
      (profile.support_email || "").trim() ||
      (profile.address_text || "").trim() ||
      (profile.business_hours || "").trim() ||
      profile.resolved_whatsapp_link
  );

  return (
    <footer className="public-footer">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.25fr_0.75fr_0.9fr] lg:px-8">
        <div className="public-card max-w-xl p-4 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <BrandLockup
            logoSrc={profile.resolved_logo_src}
            companyName={profile.resolved_display_name}
            subtitle={profile.resolved_tagline}
          />
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Public information, product browsing, application capture, and winner
            transparency for the Subidha Furniture Lucky Plan in{" "}
            {brandConfig.publicBranchLocation}.
          </p>

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
        </div>

        <div className="public-card p-4 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Quick links
          </div>
          <div className="mt-3 grid gap-2 text-sm">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-2 py-1.5 text-muted-foreground transition hover:bg-[var(--surface-muted)] hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="public-card max-w-sm p-4 text-sm shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Contact
          </div>

          {hasContact ? (
            <div className="mt-3 grid gap-2 text-muted-foreground">
              {profile.support_phone ? (
                <div className="public-card-sm px-3 py-2">
                  Phone: {profile.support_phone}
                </div>
              ) : null}
              {profile.support_email ? (
                <div className="public-card-sm px-3 py-2">
                  Email: {profile.support_email}
                </div>
              ) : null}
              {profile.business_hours ? (
                <div className="public-card-sm px-3 py-2">
                  Hours: {profile.business_hours}
                </div>
              ) : null}
              {profile.address_text ? (
                <div className="public-card-sm px-3 py-2">
                  Address: {profile.address_text}
                </div>
              ) : null}
              {profile.map_url ? (
                <Link
                  href={profile.map_url}
                  className="public-card-sm px-3 py-2 transition hover:bg-white"
                >
                  Open map
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-muted-foreground">
              Visit the branch with your product preference and phone number for enrollment assistance.
            </p>
          )}

          {hasSocial ? (
            <div className="mt-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Social
              </div>
              <div className="mt-2 grid gap-2 text-muted-foreground">
                {profile.facebook_url ? (
                  <Link href={profile.facebook_url} className="rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-muted)] hover:text-foreground">
                    Facebook
                  </Link>
                ) : null}
                {profile.instagram_url ? (
                  <Link href={profile.instagram_url} className="rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-muted)] hover:text-foreground">
                    Instagram
                  </Link>
                ) : null}
                {profile.youtube_url ? (
                  <Link href={profile.youtube_url} className="rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-muted)] hover:text-foreground">
                    YouTube
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
