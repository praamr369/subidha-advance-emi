import Link from "next/link";

import PublicPageShell from "@/components/public/PublicPageShell";
import PublicSeoJsonLd from "@/components/public/PublicSeoJsonLd";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { buildFaqJsonLd } from "@/lib/public-seo";

export type LocalSeoSection = { heading: string; body: readonly string[] };
export type LocalSeoFaq = { question: string; answer: string };
export type LocalSeoLink = { label: string; href: string };

type Props = {
  title: string;
  subtitle: string;
  breadcrumbs: ReadonlyArray<{ label: string; href?: string }>;
  intro: readonly string[];
  sections: readonly LocalSeoSection[];
  quickLinks: readonly LocalSeoLink[];
  faqs: readonly LocalSeoFaq[];
  heroEyebrow?: string;
};

/**
 * Server-rendered local SEO landing page. Fully crawlable text, one H1 (from
 * PublicPageShell), H2 sections, a visible FAQ with matching FAQPage JSON-LD,
 * and truthful call-to-action links. No financial/EMI logic is touched.
 */
export default async function LocalSeoLanding({
  title,
  subtitle,
  breadcrumbs,
  intro,
  sections,
  quickLinks,
  faqs,
  heroEyebrow,
}: Props) {
  const profile = await getResolvedPublicBusinessProfile().catch(() => null);
  const phone = profile?.support_phone?.trim();
  const whatsapp = profile?.resolved_whatsapp_link?.trim();
  const address = profile?.address_text?.trim();

  return (
    <>
      {faqs.length > 0 ? <PublicSeoJsonLd payload={buildFaqJsonLd(faqs)} /> : null}
      <PublicPageShell
        title={title}
        subtitle={subtitle}
        breadcrumbs={breadcrumbs}
        hero={heroEyebrow ? { eyebrow: heroEyebrow, badges: ["Asansol", "West Bengal"] } : undefined}
        actions={[
          { label: "Contact showroom", href: "/contact", variant: "primary" },
          { label: "Browse products", href: "/products", variant: "secondary" },
        ]}
      >
        <div className="flex flex-col gap-10">
          <section className="flex flex-col gap-4 text-base leading-relaxed text-muted-foreground">
            {intro.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </section>

          {sections.map((section) => (
            <section key={section.heading} className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold text-foreground">{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index} className="text-base leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold text-foreground">Explore more</h2>
            <ul className="flex flex-wrap gap-3">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {(phone || whatsapp || address) && (
            <section className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 p-5">
              <h2 className="text-xl font-semibold text-foreground">Visit or contact Subidha Furniture</h2>
              {address ? <p className="text-base text-muted-foreground">{address}</p> : null}
              <div className="flex flex-wrap gap-4 text-base">
                {phone ? (
                  <a href={`tel:${phone.replace(/\s+/g, "")}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    Call {phone}
                  </a>
                ) : null}
                {whatsapp ? (
                  <a href={whatsapp} className="font-medium text-primary underline-offset-4 hover:underline" rel="noopener noreferrer" target="_blank">
                    WhatsApp us
                  </a>
                ) : null}
                <Link href="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
                  Contact page
                </Link>
              </div>
            </section>
          )}

          {faqs.length > 0 ? (
            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold text-foreground">Frequently asked questions</h2>
              <dl className="flex flex-col gap-4">
                {faqs.map((faq) => (
                  <div key={faq.question} className="rounded-xl border border-border p-4">
                    <dt className="text-base font-semibold text-foreground">{faq.question}</dt>
                    <dd className="mt-1 text-base leading-relaxed text-muted-foreground">{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </PublicPageShell>
    </>
  );
}
