import Link from "next/link";

import BrandLockup from "@/components/public/BrandLockup";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import { brandConfig } from "@/config/brand";
import { PUBLIC_LEGAL_DISCLAIMER_POINTS } from "@/lib/public-content";
import { getPublicDictionary, getText, publicContent, PUBLIC_LANGUAGE_LABELS } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { ROUTES } from "@/lib/routes";

const productCategoryLinks = ["Sofas", "Beds", "Wardrobes", "Dining sets", "Refrigerators", "Washing machines", "TV & electronics", "Kitchen appliances"];

const footerLinkClassName =
  "inline-flex min-h-10 items-center rounded-xl px-3 py-2 text-muted-foreground transition hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2";

export default async function PublicFooter() {
  const [profile, locale] = await Promise.all([getResolvedPublicBusinessProfile(), getPublicLocale()]);
  const dictionary = getPublicDictionary(locale);
  const hasSocial = Boolean((profile.facebook_url || "").trim() || (profile.instagram_url || "").trim() || (profile.youtube_url || "").trim());
  const trustTitle = getText(publicContent.supportStrip.title, locale);
  const trustDescription = getText(publicContent.supportStrip.description, locale);

  const footerLinks = [
    { href: ROUTES.public.products, label: dictionary.common.products },
    { href: ROUTES.public.contracts, label: "Contracts" },
    { href: ROUTES.public.contractsAdvanceEmi, label: "Advance EMI (Lucky Plan)" },
    { href: ROUTES.public.contractsRent, label: "Rent contract" },
    { href: ROUTES.public.contractsLease, label: "Lease contract" },
    { href: ROUTES.public.about, label: "About" },
    { href: ROUTES.public.howItWorks, label: dictionary.common.howItWorks },
    { href: ROUTES.public.faq, label: "FAQ" },
    { href: ROUTES.public.rulebook, label: "Rulebook" },
    { href: ROUTES.public.customers, label: "Customer guide" },
    { href: ROUTES.public.partners, label: "Partner program" },
    { href: ROUTES.public.winners, label: dictionary.common.winners },
    { href: ROUTES.public.winnerHistory, label: dictionary.common.winnerHistory },
    { href: ROUTES.public.contact, label: dictionary.common.contact },
    { href: ROUTES.public.terms, label: "Terms" },
    { href: ROUTES.public.privacy, label: "Privacy" },
    { href: ROUTES.public.legalDisclaimer, label: "Disclaimer" },
    { href: ROUTES.public.legalPolicies, label: "Legal policies" },
    { href: ROUTES.public.refundCancellation, label: "Refund / Cancellation" },
    { href: ROUTES.public.policies, label: "Business policies" },
    { href: ROUTES.public.warranty, label: "Warranty" },
    { href: ROUTES.public.deliveryPolicy, label: "Delivery policy" },
    { href: ROUTES.public.rentalLeasePolicy, label: "Rental / Lease policy" },
    { href: ROUTES.public.luckyPlanPolicy, label: "Lucky Plan EMI policy" },
    { href: ROUTES.public.directSalePolicy, label: "Direct sale policy" },
    { href: ROUTES.public.paymentPolicy, label: "Payment policy" },
    { href: ROUTES.public.servicePolicy, label: "Service / Repair policy" },
    { href: ROUTES.public.grievance, label: "Grievance policy" },
    { href: ROUTES.public.dataRequests, label: "Data request policy" },
    { href: ROUTES.public.businessCompliance, label: "Business compliance" },
    { href: ROUTES.public.udyamMsme, label: "Udyam / MSME info" },
  ];

  return (
    <footer className="public-footer">
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <PublicDisclaimerBox title="Public information notice" points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />
      </div>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.2fr_0.8fr_0.9fr] lg:px-8">
        <div className="public-card min-w-0 max-w-xl p-4 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <BrandLockup logoSrc={profile.resolved_logo_src} companyName={profile.resolved_display_name} subtitle={profile.resolved_tagline} />
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-muted-foreground">Advance EMI • Rent • Lease • Direct Sale</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Trusted local retail support for furniture, electronics, and home appliances in {brandConfig.publicBranchLocation}.
          </p>
          <div className="mt-4 rounded-xl border border-white/75 bg-white/75 p-3 text-sm dark:border-border/70 dark:bg-[color-mix(in_oklab,var(--surface-card-elevated)_82%,transparent)]">
            <div className="font-semibold text-foreground">{trustTitle}</div>
            <p className="mt-1 text-muted-foreground">{trustDescription}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-muted-foreground">Language: {PUBLIC_LANGUAGE_LABELS[locale]}</p>
          </div>
        </div>

        <div className="public-card min-w-0 p-4 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{dictionary.footer.quickLinks}</div>
          <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-1">
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href} className={footerLinkClassName}>
                {link.label}
              </Link>
            ))}
          </div>
          <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Popular categories</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {productCategoryLinks.map((category) => (
              <span key={category} className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs text-slate-600 dark:border-border/70 dark:bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] dark:text-muted-foreground">
                {category}
              </span>
            ))}
          </div>
        </div>

        <div className="public-card min-w-0 max-w-sm p-4 text-sm shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{dictionary.footer.contact}</div>
          <div className="mt-3 grid gap-2 text-muted-foreground">
            {profile.support_phone ? <div className="public-card-sm break-words px-3 py-2">Phone: {profile.support_phone}</div> : null}
            {profile.support_email ? <div className="public-card-sm break-words px-3 py-2">Email: {profile.support_email}</div> : null}
            {profile.business_hours ? <div className="public-card-sm break-words px-3 py-2">Hours: {profile.business_hours}</div> : null}
            {profile.address_text ? <div className="public-card-sm break-words px-3 py-2">Address: {profile.address_text}</div> : null}
            {profile.resolved_whatsapp_link ? (
              <Link href={profile.resolved_whatsapp_link} className="public-card-sm inline-flex min-h-10 items-center px-3 py-2 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2 dark:hover:bg-muted/50">
                {dictionary.footer.whatsapp}
              </Link>
            ) : null}
          </div>

          {hasSocial ? (
            <div className="mt-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{dictionary.footer.social}</div>
              <div className="mt-2 grid gap-1 text-muted-foreground">
                {profile.facebook_url ? <Link href={profile.facebook_url} className={footerLinkClassName}>Facebook</Link> : null}
                {profile.instagram_url ? <Link href={profile.instagram_url} className={footerLinkClassName}>Instagram</Link> : null}
                {profile.youtube_url ? <Link href={profile.youtube_url} className={footerLinkClassName}>YouTube</Link> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="border-t border-border/40 px-4 py-4 sm:px-6 lg:px-8">
        <p className="mx-auto max-w-7xl text-center text-xs text-muted-foreground">
          &copy; Subidha Furniture. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
