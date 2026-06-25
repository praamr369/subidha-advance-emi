import Link from "next/link";
import { Clock3, Mail, MapPin, MessageCircle, Phone, type LucideIcon } from "lucide-react";

import type { ResolvedPublicBusinessProfile } from "@/lib/public-profile";

type ContactBranchTrustPanelProps = {
  profile: ResolvedPublicBusinessProfile;
};

type ContactTrustRow = {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
  action?: string;
  external?: boolean;
};

function cleanPhoneHref(phone?: string): string | null {
  const value = (phone || "").trim();
  if (!value) return null;
  return `tel:${value.replace(/\s+/g, "")}`;
}

function isContactTrustRow(row: ContactTrustRow | null): row is ContactTrustRow {
  return row !== null;
}

export default function ContactBranchTrustPanel({ profile }: ContactBranchTrustPanelProps) {
  const phoneHref = cleanPhoneHref(profile.support_phone);

  const sourceRows: Array<ContactTrustRow | null> = [
    profile.address_text
      ? { icon: MapPin, label: "Address", value: profile.address_text, href: profile.map_url || undefined, action: profile.map_url ? "Open map" : undefined }
      : null,
    profile.support_phone
      ? { icon: Phone, label: "Phone", value: profile.support_phone, href: phoneHref || undefined, action: "Call" }
      : null,
    profile.support_email
      ? { icon: Mail, label: "Email", value: profile.support_email, href: `mailto:${profile.support_email}`, action: "Email" }
      : null,
    profile.business_hours
      ? { icon: Clock3, label: "Hours", value: profile.business_hours }
      : null,
    profile.resolved_whatsapp_link
      ? { icon: MessageCircle, label: "WhatsApp", value: "Message branch support", href: profile.resolved_whatsapp_link, action: "Open WhatsApp", external: true }
      : null,
  ];
  const rows: ContactTrustRow[] = sourceRows.filter(isContactTrustRow);

  return (
    <section className="public-surface p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Branch details</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Visit or contact the branch</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Use these details for product checks, plan guidance, documents, delivery coordination, or after-sales support. Operational records are created only through staff-controlled workflows.
      </p>

      <div className="mt-5 grid gap-3">
        {rows.length > 0 ? (
          rows.map((row) => {
            const Icon = row.icon;
            const content = (
              <>
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_12%,var(--surface-card-elevated)_88%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{row.label}</span>
                  <span className="mt-1 block text-sm font-medium leading-6 text-foreground">{row.value}</span>
                </span>
                {row.action ? <span className="text-xs font-semibold text-primary">{row.action}</span> : null}
              </>
            );

            return row.href ? (
              <Link
                key={row.label}
                href={row.href}
                target={row.external ? "_blank" : undefined}
                rel={row.external ? "noopener noreferrer" : undefined}
                className="public-card-sm flex items-center gap-3 px-4 py-3 transition hover:-translate-y-0.5 hover:bg-[var(--surface-card-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
              >
                {content}
              </Link>
            ) : (
              <div key={row.label} className="public-card-sm flex items-center gap-3 px-4 py-3">
                {content}
              </div>
            );
          })
        ) : (
          <div className="public-card-sm px-4 py-3 text-sm leading-6 text-muted-foreground">
            Branch contact details are not published yet. Use the form and the team will respond through the configured support workflow.
          </div>
        )}
      </div>
    </section>
  );
}
