"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";

import BrandLockup from "@/components/public/BrandLockup";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const links = [
  { href: ROUTES.public.home, label: "Home" },
  { href: ROUTES.public.products, label: "Products" },
  { href: ROUTES.public.luckyPlan, label: "Lucky Plan" },
  { href: ROUTES.public.howItWorks, label: "How It Works" },
  { href: ROUTES.public.winners, label: "Winners" },
  { href: ROUTES.public.winnerHistory, label: "Winner History" },
  { href: ROUTES.public.about, label: "About" },
  { href: ROUTES.public.contact, label: "Contact" },
  { href: ROUTES.public.blog, label: "Blog" },
];

const actions = [
  { href: ROUTES.public.apply, label: "Apply", variant: "primary" as const },
  { href: ROUTES.public.register, label: "Register", variant: "secondary" as const },
  { href: ROUTES.public.login, label: "Login", variant: "secondary" as const },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === ROUTES.public.home) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

type PublicNavClientProps = {
  logoSrc?: string;
  companyName?: string;
  brandSubtitle?: string;
  whatsappLink?: string | null;
};

export default function PublicNavClient({
  logoSrc,
  companyName,
  brandSubtitle,
  whatsappLink,
}: PublicNavClientProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const showWhatsApp = useMemo(() => Boolean((whatsappLink || "").trim()), [whatsappLink]);

  return (
    <nav className="public-nav">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:gap-0 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={ROUTES.public.home}
            className="min-w-0"
            onClick={() => setMobileOpen(false)}
          >
            <BrandLockup
              compact
              logoSrc={logoSrc}
              companyName={companyName}
              subtitle={brandSubtitle}
            />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/80 bg-white/82 text-foreground shadow-[0_12px_26px_-18px_rgba(15,23,42,0.65)] transition hover:bg-white lg:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        <div className="hidden items-center justify-between gap-6 lg:flex">
          <div className="flex flex-wrap gap-2 lg:justify-center">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-medium transition-colors hover:text-slate-950",
                  isActivePath(pathname, link.href)
                    ? "bg-white/80 text-slate-950 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.78)]"
                    : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showWhatsApp ? (
              <Link
                href={whatsappLink as string}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Link>
            ) : null}

            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={cn(
                  "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)] transition",
                  action.variant === "primary"
                    ? "border-slate-950/10 bg-slate-950 text-white hover:-translate-y-0.5"
                    : "border-white/80 bg-white/80 text-foreground hover:-translate-y-0.5 hover:bg-white"
                )}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>

        <div className={cn("grid gap-3 lg:hidden", mobileOpen ? "grid" : "hidden")}>
          <div className="rounded-2xl border border-white/75 bg-white/82 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Navigate
            </div>
            <div className="mt-2 grid gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    isActivePath(pathname, link.href)
                      ? "bg-slate-950 text-white shadow-[0_10px_26px_-20px_rgba(15,23,42,0.8)]"
                      : "text-foreground hover:bg-[var(--surface-muted)]"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border border-white/75 bg-white/82 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Quick actions
            </div>

            {showWhatsApp ? (
              <Link
                href={whatsappLink as string}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/80 bg-white px-4 text-sm font-semibold text-foreground shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)] transition"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Link>
            ) : null}

            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)] transition",
                  action.variant === "primary"
                    ? "border-slate-950/10 bg-slate-950 text-white"
                    : "border-white/80 bg-white text-foreground"
                )}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
