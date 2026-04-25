import Link from "next/link";

import BrandLockup from "@/components/public/BrandLockup";
<<<<<<< ours
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { ROUTES } from "@/lib/routes";

export default async function PublicFooter() {
  const profile = await getResolvedPublicBusinessProfile();
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);

  const footerLinks = [
    { href: ROUTES.public.products, label: dictionary.common.products },
    { href: ROUTES.public.luckyPlan, label: dictionary.common.luckyPlan },
    { href: ROUTES.public.apply, label: dictionary.common.apply },
    { href: ROUTES.public.winnerHistory, label: dictionary.common.winnerHistory },
    { href: ROUTES.public.contact, label: dictionary.common.contact },
    { href: ROUTES.public.blog, label: dictionary.nav.links[8] },
    { href: ROUTES.public.login, label: dictionary.nav.login },
    { href: ROUTES.public.register, label: dictionary.nav.register },
  ];

=======
import { brandConfig } from "@/config/brand";
import { getPublicLanguage } from "@/lib/public-i18n.server";
import { getText, publicContent, PUBLIC_LANGUAGE_LABELS } from "@/lib/public-i18n";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { ROUTES } from "@/lib/routes";

const footerLinks = [
  { href: ROUTES.public.products, label: "Products" },
  { href: ROUTES.public.luckyPlan, label: "Lucky Plan" },
  { href: ROUTES.public.howItWorks, label: "How It Works" },
  { href: ROUTES.public.winners, label: "Winners" },
  { href: ROUTES.public.winnerHistory, label: "Winner History" },
  { href: ROUTES.public.contact, label: "Contact" },
];

const productCategoryLinks = [
  "Sofas",
  "Beds",
  "Wardrobes",
  "Dining sets",
  "Refrigerators",
  "Washing machines",
  "TV & electronics",
  "Kitchen appliances",
];

export default async function PublicFooter() {
  const [profile, language] = await Promise.all([
    getResolvedPublicBusinessProfile(),
    getPublicLanguage(),
  ]);
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
  const hasSocial = Boolean(
    (profile.facebook_url || "").trim() ||
      (profile.instagram_url || "").trim() ||
      (profile.youtube_url || "").trim()
  );
<<<<<<< ours
<<<<<<< ours
=======

  const trustTitle = getText(publicContent.supportStrip.title, language);
  const trustDescription = getText(publicContent.supportStrip.description, language);
>>>>>>> theirs
=======

  const trustTitle = getText(publicContent.supportStrip.title, language);
  const trustDescription = getText(publicContent.supportStrip.description, language);
>>>>>>> theirs

  return (
    <footer className="public-footer">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.2fr_0.8fr_0.9fr] lg:px-8">
        <div className="public-card max-w-xl p-4 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <BrandLockup
            logoSrc={profile.resolved_logo_src}
            companyName={profile.resolved_display_name}
            subtitle={profile.resolved_tagline}
          />
<<<<<<< ours
<<<<<<< ours
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{dictionary.footer.intro}</p>

          {profile.resolved_whatsapp_link ? (
            <div className="mt-4">
              <Link
                href={profile.resolved_whatsapp_link}
                className="inline-flex h-10 items-center rounded-xl border border-slate-950/10 bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5"
              >
                {dictionary.footer.whatsapp}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="public-card p-4 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {dictionary.footer.quickLinks}
          </div>
=======
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Trusted local retail support for furniture, electronics, and home appliances in {brandConfig.publicBranchLocation}.
          </p>
          <div className="mt-4 rounded-xl border border-white/75 bg-white/75 p-3 text-sm">
            <div className="font-semibold text-foreground">{trustTitle}</div>
            <p className="mt-1 text-muted-foreground">{trustDescription}</p>
            <p className="mt-2 text-xs text-slate-500">Language: {PUBLIC_LANGUAGE_LABELS[language]}</p>
          </div>
        </div>

        <div className="public-card p-4 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quick links</div>
>>>>>>> theirs
=======
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Trusted local retail support for furniture, electronics, and home appliances in {brandConfig.publicBranchLocation}.
          </p>
          <div className="mt-4 rounded-xl border border-white/75 bg-white/75 p-3 text-sm">
            <div className="font-semibold text-foreground">{trustTitle}</div>
            <p className="mt-1 text-muted-foreground">{trustDescription}</p>
            <p className="mt-2 text-xs text-slate-500">Language: {PUBLIC_LANGUAGE_LABELS[language]}</p>
          </div>
        </div>

        <div className="public-card p-4 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quick links</div>
>>>>>>> theirs
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
          <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Popular categories</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {productCategoryLinks.map((category) => (
              <span key={category} className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs text-slate-600">
                {category}
              </span>
            ))}
          </div>
        </div>

        <div className="public-card max-w-sm p-4 text-sm shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)]">
<<<<<<< ours
<<<<<<< ours
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {dictionary.footer.contact}
          </div>
=======
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Help & contact</div>
>>>>>>> theirs
=======
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Help & contact</div>
>>>>>>> theirs
          <div className="mt-3 grid gap-2 text-muted-foreground">
            {profile.support_phone ? <div className="public-card-sm px-3 py-2">Phone: {profile.support_phone}</div> : null}
            {profile.support_email ? <div className="public-card-sm px-3 py-2">Email: {profile.support_email}</div> : null}
            {profile.business_hours ? <div className="public-card-sm px-3 py-2">Hours: {profile.business_hours}</div> : null}
            {profile.address_text ? <div className="public-card-sm px-3 py-2">Address: {profile.address_text}</div> : null}
<<<<<<< ours
<<<<<<< ours
=======
=======
>>>>>>> theirs
            {profile.resolved_whatsapp_link ? (
              <Link href={profile.resolved_whatsapp_link} className="public-card-sm px-3 py-2 transition hover:bg-white">
                WhatsApp support
              </Link>
            ) : null}
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
          </div>

          {hasSocial ? (
            <div className="mt-4">
<<<<<<< ours
<<<<<<< ours
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {dictionary.footer.social}
              </div>
              <div className="mt-2 grid gap-2 text-muted-foreground">
                {profile.facebook_url ? <Link href={profile.facebook_url}>Facebook</Link> : null}
                {profile.instagram_url ? <Link href={profile.instagram_url}>Instagram</Link> : null}
                {profile.youtube_url ? <Link href={profile.youtube_url}>YouTube</Link> : null}
=======
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Social</div>
              <div className="mt-2 grid gap-2 text-muted-foreground">
                {profile.facebook_url ? <Link href={profile.facebook_url} className="rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-muted)] hover:text-foreground">Facebook</Link> : null}
                {profile.instagram_url ? <Link href={profile.instagram_url} className="rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-muted)] hover:text-foreground">Instagram</Link> : null}
                {profile.youtube_url ? <Link href={profile.youtube_url} className="rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-muted)] hover:text-foreground">YouTube</Link> : null}
>>>>>>> theirs
=======
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Social</div>
              <div className="mt-2 grid gap-2 text-muted-foreground">
                {profile.facebook_url ? <Link href={profile.facebook_url} className="rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-muted)] hover:text-foreground">Facebook</Link> : null}
                {profile.instagram_url ? <Link href={profile.instagram_url} className="rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-muted)] hover:text-foreground">Instagram</Link> : null}
                {profile.youtube_url ? <Link href={profile.youtube_url} className="rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-muted)] hover:text-foreground">YouTube</Link> : null}
>>>>>>> theirs
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
