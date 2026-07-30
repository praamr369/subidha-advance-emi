"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Package, Calculator, Gift, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";

export default function PublicBottomNav() {
  const pathname = usePathname();

  const tabs = [
    { href: ROUTES.public.home, icon: Home, label: "Home" },
    { href: ROUTES.public.products, icon: Package, label: "Products" },
    { href: ROUTES.public.howItWorks, icon: Calculator, label: "EMI" },
    { href: ROUTES.public.luckyPlan, icon: Gift, label: "Lucky Plan" },
    { href: ROUTES.public.login, icon: User, label: "Account" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card)_85%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="flex h-16 items-center justify-around px-2">
        {tabs.map((tab) => {
          const isActive = tab.href === ROUTES.public.home ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                  isActive ? "bg-primary/10" : "bg-transparent"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive ? "stroke-[2.5px]" : "stroke-[2px]")} />
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
