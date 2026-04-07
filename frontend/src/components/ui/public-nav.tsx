// src/components/ui/public-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <nav className="border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Link href={ROUTES.public.home} className="min-w-0">
          <BrandLockup compact />
        </Link>

        <div className="flex flex-wrap gap-4 lg:justify-center">
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
                "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)] transition",
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
    </nav>
  );
}
