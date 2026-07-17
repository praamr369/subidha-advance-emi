"use client";

import Link from "next/link";
import {
  BarChart3,
  Home,
  LayoutGrid,
  Package,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: (pathname: string) => boolean;
  onClick?: () => void;
};

const TABS: Tab[] = [
  {
    label: "Home",
    href: "/partner",
    icon: Home,
    match: (p) => p === "/partner",
  },
  {
    label: "Catalog",
    href: "/partner/catalog",
    icon: Package,
    match: (p) => p.startsWith("/partner/catalog"),
  },
  {
    label: "Customers",
    href: "/partner/customers",
    icon: Users,
    match: (p) => p.startsWith("/partner/customers"),
  },
  {
    label: "Collect",
    href: "/partner/collections",
    icon: Wallet,
    match: (p) =>
      p.startsWith("/partner/collections") ||
      p.startsWith("/partner/payments") ||
      p.startsWith("/partner/product-requests") ||
      p.startsWith("/partner/kyc-requests"),
  },
  {
    label: "More",
    icon: LayoutGrid,
    match: () => false,
  },
];

type Props = {
  pathname: string;
  onOpenMenu: () => void;
};

export default function PartnerMobileBottomNav({ pathname, onOpenMenu }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-stretch border-t border-border bg-[var(--sidebar-surface,hsl(var(--card)))] shadow-[0_-1px_0_0_rgba(0,0,0,0.06),0_-8px_24px_-12px_rgba(0,0,0,0.12)] md:hidden"
      aria-label="Partner navigation"
    >
      {TABS.map((tab) => {
        const isActive = tab.match ? tab.match(pathname) : false;
        const commonCls = cn(
          "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide transition-colors",
          isActive
            ? "text-primary"
            : "text-muted-foreground active:text-foreground"
        );

        if (tab.href) {
          return (
            <Link key={tab.label} href={tab.href} className={commonCls}>
              <tab.icon
                className={cn("size-5 transition-transform", isActive && "scale-110")}
              />
              <span>{tab.label}</span>
              {isActive ? (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
              ) : null}
            </Link>
          );
        }

        return (
          <button
            key={tab.label}
            type="button"
            onClick={onOpenMenu}
            className={cn(commonCls, "relative")}
            aria-label="Open navigation menu"
          >
            <tab.icon className="size-5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
