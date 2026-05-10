"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";

import BrandLockup from "@/components/public/BrandLockup";
import LanguageSwitcher from "@/components/public/LanguageSwitcher";
import ThemeToggle from "@/components/ui/ThemeToggle";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { ROUTES } from "@/lib/routes";
import { getText, publicContent, type PublicLanguage } from "@/lib/public-i18n";
import { cn } from "@/lib/utils";

function isActivePath(pathname: string, href: string): boolean {
  if (href === ROUTES.public.home) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

type PublicNavClientProps = {
  logoSrc?: string;
  companyName?: string;
  brandSubtitle?: string;
  whatsappLink?: string | null;
  dictionary: {
    links: readonly string[];
    apply: string;
    register: string;
    login: string;
    whatsapp: string;
    navigate: string;
    quickActions: string;
    language: string;
  };
  language: PublicLanguage;
};

export default function PublicNavClient({
  logoSrc,
  companyName,
  brandSubtitle,
  whatsappLink,
  dictionary,
  language,
}: PublicNavClientProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { href: ROUTES.public.home, label: dictionary.links[0] },
    { href: ROUTES.public.products, label: dictionary.links[1] },
    { href: ROUTES.public.luckyPlan, label: dictionary.links[2] },
    { href: ROUTES.public.howItWorks, label: dictionary.links[3] },
    { href: ROUTES.public.winners, label: dictionary.links[4] },
    { href: ROUTES.public.winnerHistory, label: dictionary.links[5] },
    { href: ROUTES.public.about, label: dictionary.links[6] },
    { href: ROUTES.public.contact, label: dictionary.links[7] },
    { href: ROUTES.public.blog, label: dictionary.links[8] },
  ];

  const actions = [
    { href: ROUTES.public.apply, label: dictionary.apply, variant: "primary" as const },
    { href: ROUTES.public.register, label: dictionary.register, variant: "secondary" as const },
    { href: ROUTES.public.login, label: dictionary.login, variant: "secondary" as const },
  ];

  const showWhatsApp = useMemo(() => Boolean((whatsappLink || "").trim()), [whatsappLink]);
  const trustBadge = getText(publicContent.nav.trustBadge, language);

  return (
    <nav className="public-nav" aria-label="Primary navigation">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link href={ROUTES.public.home} className="min-w-0" onClick={() => setMobileOpen(false)}>
            <BrandLockup compact logoSrc={logoSrc} companyName={companyName} subtitle={brandSubtitle} />
          </Link>
          <div className="hidden lg:flex">
            <LanguageSwitcher value={language} />
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle variant="public" />
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card-elevated)_90%,transparent)] text-foreground shadow-[0_12px_26px_-18px_rgba(15,23,42,0.65)] transition hover:bg-[var(--surface-muted)] dark:shadow-[0_12px_26px_-18px_rgba(0,0,0,0.45)]"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="hidden items-center justify-between gap-6 lg:flex">
          <NavigationMenu className="flex max-w-none flex-1 justify-center">
            <NavigationMenuList className="flex-wrap justify-center gap-2">
              {links.map((link) => {
                const active = isActivePath(pathname, link.href);
                return (
                  <NavigationMenuItem key={link.href}>
                    <NavigationMenuLink asChild active={active}>
                      <Link
                        href={link.href}
                        className={cn(!active && "text-muted-foreground")}
                      >
                        {link.label}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                );
              })}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle variant="public" />
            <LanguageSwitcher value={language} />
            {showWhatsApp ? (
              <Link
                href={whatsappLink as string}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card-elevated)_88%,transparent)] px-4 text-sm font-semibold text-foreground shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)] transition hover:-translate-y-0.5 hover:bg-[var(--surface-muted)] dark:shadow-[0_16px_32px_-26px_rgba(0,0,0,0.5)]"
              >
                <MessageCircle className="h-4 w-4" />
                {dictionary.whatsapp}
              </Link>
            ) : null}

            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={cn(
                  "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)] transition dark:shadow-[0_16px_32px_-26px_rgba(0,0,0,0.5)]",
                  action.variant === "primary"
                    ? "border-primary/25 bg-primary text-primary-foreground hover:-translate-y-0.5"
                    : "border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card-elevated)_88%,transparent)] text-foreground hover:-translate-y-0.5 hover:bg-[var(--surface-muted)]"
                )}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="hidden rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card-soft)_82%,transparent)] px-4 py-2 text-xs font-semibold text-muted-foreground lg:block">
          {trustBadge}
        </div>

        <div className={cn("grid gap-3 lg:hidden", mobileOpen ? "grid" : "hidden")}>
          <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card-elevated)_88%,transparent)] p-3">
            <LanguageSwitcher value={language} />
            <ThemeToggle variant="public" className="mt-2" />
            <div className="mt-2 text-xs font-semibold text-muted-foreground">{trustBadge}</div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card-elevated)_88%,transparent)] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {dictionary.navigate}
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
                      ? "bg-primary text-primary-foreground shadow-[0_10px_26px_-20px_rgba(15,23,42,0.8)] dark:shadow-[0_10px_26px_-20px_rgba(0,0,0,0.55)]"
                      : "text-foreground hover:bg-[var(--surface-muted)]"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card-elevated)_88%,transparent)] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {dictionary.quickActions}
            </div>
            {showWhatsApp ? (
              <Link
                href={whatsappLink as string}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-card-elevated)] px-4 text-sm font-semibold text-foreground shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)] transition dark:shadow-[0_16px_32px_-26px_rgba(0,0,0,0.5)]"
              >
                <MessageCircle className="h-4 w-4" />
                {dictionary.whatsapp}
              </Link>
            ) : null}
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)] transition dark:shadow-[0_16px_32px_-26px_rgba(0,0,0,0.5)]",
                  action.variant === "primary"
                    ? "border-primary/25 bg-primary text-primary-foreground"
                    : "border-[var(--border)] bg-[var(--surface-card-elevated)] text-foreground"
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
