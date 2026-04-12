// src/components/ui/public-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";

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

export default function PublicNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:gap-0 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={ROUTES.public.home}
            className="min-w-0"
            onClick={() => setMobileOpen(false)}
          >
            <BrandLockup compact />
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
                  "rounded-full px-3 py-2 text-sm font-medium transition-colors hover:text-primary",
                  isActivePath(pathname, link.href)
                    ? "bg-white/80 text-primary shadow-[0_12px_28px_-22px_rgba(15,23,42,0.78)]"
                    : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
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
                      ? "bg-primary text-primary-foreground shadow-[0_10px_26px_-20px_rgba(30,64,175,0.8)]"
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
