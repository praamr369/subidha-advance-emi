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

  const discoverLinks = [
    { href: ROUTES.public.products, label: dictionary.common.products },
    { href: ROUTES.public.contractsAdvanceEmi, label: "Advance EMI (Lucky Plan)" },
    { href: ROUTES.public.contractsRent, label: "Rent contract" },
    { href: ROUTES.public.contractsLease, label: "Lease contract" },
    { href: ROUTES.public.contracts, label: "All Contracts" },
    { href: ROUTES.public.winners, label: dictionary.common.winners },
    { href: ROUTES.public.winnerHistory, label: dictionary.common.winnerHistory },
  ];

  const companyLinks = [
    { href: ROUTES.public.about, label: "About Us" },
    { href: ROUTES.public.howItWorks, label: dictionary.common.howItWorks },
    { href: ROUTES.public.faq, label: "FAQ" },
    { href: ROUTES.public.rulebook, label: "Lucky Plan Rulebook" },
    { href: ROUTES.public.customers, label: "Customer Guide" },
    { href: ROUTES.public.partners, label: "Partner Program" },
    { href: ROUTES.public.contact, label: dictionary.common.contact },
  ];

  const policyLinks = [
    { href: ROUTES.public.policies, label: "Business Policies" },
    { href: ROUTES.public.luckyPlanPolicy, label: "Lucky Plan EMI Policy" },
    { href: ROUTES.public.rentalLeasePolicy, label: "Rental / Lease Policy" },
    { href: ROUTES.public.directSalePolicy, label: "Direct Sale Policy" },
    { href: ROUTES.public.warranty, label: "Warranty & Support" },
    { href: ROUTES.public.deliveryPolicy, label: "Delivery Policy" },
    { href: ROUTES.public.paymentPolicy, label: "Payment Policy" },
    { href: ROUTES.public.servicePolicy, label: "Service / Repair Policy" },
    { href: ROUTES.public.refundCancellation, label: "Refund / Cancellation" },
  ];

  const legalLinks = [
    { href: ROUTES.public.terms, label: "Terms of Service" },
    { href: ROUTES.public.privacy, label: "Privacy Policy" },
    { href: ROUTES.public.legalDisclaimer, label: "Disclaimer" },
    { href: ROUTES.public.legalPolicies, label: "All Legal Policies" },
    { href: ROUTES.public.grievance, label: "Grievance Redressal" },
    { href: ROUTES.public.dataRequests, label: "Data Requests" },
    { href: ROUTES.public.businessCompliance, label: "Business Compliance" },
    { href: ROUTES.public.udyamMsme, label: "Udyam / MSME Info" },
  ];

  return (
    <footer className="w-full border-t border-border/40 bg-[color-mix(in_oklab,var(--surface-card)_97%,transparent)]">
      <div className="mx-auto max-w-7xl px-4 pt-10 pb-6 sm:px-6 lg:px-8">
        <PublicDisclaimerBox title="Public information notice" points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />
      </div>
      
      {/* Main Footer Links */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Column 1: Brand & Contact */}
          <div className="col-span-2 lg:col-span-1 flex flex-col gap-5">
            <BrandLockup compact logoSrc={profile.resolved_logo_src} companyName={profile.resolved_display_name} subtitle={profile.resolved_tagline} />
            <p className="text-sm leading-6 text-muted-foreground mt-2">
              Trusted local retail support for furniture, electronics, and home appliances in {brandConfig.publicBranchLocation}.
            </p>
            
            <div className="text-sm text-muted-foreground space-y-2 mt-4">
              <div className="font-semibold text-foreground tracking-tight">{dictionary.footer.contact}</div>
              {profile.support_phone && <div>Phone: {profile.support_phone}</div>}
              {profile.support_email && <div>Email: {profile.support_email}</div>}
              {profile.business_hours && <div>Hours: {profile.business_hours}</div>}
            </div>
            
            {hasSocial && (
              <div className="mt-2 flex gap-4">
                {profile.facebook_url && <Link href={profile.facebook_url} className="text-muted-foreground hover:text-foreground transition">Facebook</Link>}
                {profile.instagram_url && <Link href={profile.instagram_url} className="text-muted-foreground hover:text-foreground transition">Instagram</Link>}
                {profile.youtube_url && <Link href={profile.youtube_url} className="text-muted-foreground hover:text-foreground transition">YouTube</Link>}
              </div>
            )}
          </div>

          {/* Column 2: Discover */}
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight">Shop & Plans</h3>
            <ul className="mt-6 space-y-3">
              {discoverLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground transition hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Company */}
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight">Company</h3>
            <ul className="mt-6 space-y-3">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground transition hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Policies */}
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight">Policies</h3>
            <ul className="mt-6 space-y-3">
              {policyLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground transition hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 5: Legal */}
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight">Legal</h3>
            <ul className="mt-6 space-y-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground transition hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Categories & Language */}
      <div className="border-t border-border/40 bg-[color-mix(in_oklab,var(--surface-card-elevated)_70%,transparent)]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            
            {/* Categories */}
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Categories:</span>
                {productCategoryLinks.map((category) => (
                  <span key={category} className="hover:text-foreground cursor-pointer transition">
                    {category}
                  </span>
                ))}
              </div>
            </div>

            {/* Locale & Language */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="flex h-5 items-center justify-center rounded-sm border border-border/70 bg-card px-2 font-medium">
                  {PUBLIC_LANGUAGE_LABELS[locale]}
                </span>
              </div>
              <span>India</span>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="bg-[#131A22] dark:bg-[#0B1014] text-[#DDD]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 text-center text-[11px]">
          <div className="flex flex-wrap justify-center gap-4 mb-2">
            <Link href={ROUTES.public.terms} className="hover:underline">Conditions of Use</Link>
            <Link href={ROUTES.public.privacy} className="hover:underline">Privacy Notice</Link>
            <Link href={ROUTES.public.legalDisclaimer} className="hover:underline">Disclaimer</Link>
          </div>
          &copy; {new Date().getFullYear()} {profile.resolved_display_name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
