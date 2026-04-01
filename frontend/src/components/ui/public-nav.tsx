// src/components/ui/public-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    <nav className="border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Link href={ROUTES.public.home} className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            SUBIDHA CORE
          </div>
          <div className="text-lg font-semibold text-foreground">
            Subidha Furniture
          </div>
          <div className="text-xs text-muted-foreground">
            Lucky Plan product browsing, enquiry, and winner transparency
          </div>
        </Link>

        <div className="flex flex-wrap gap-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                isActivePath(pathname, link.href) ? "text-primary" : "text-muted-foreground"
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
                "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium transition",
                action.variant === "primary"
                  ? "border-primary bg-primary text-primary-foreground hover:opacity-95"
                  : "border-border bg-background text-foreground hover:bg-muted"
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
