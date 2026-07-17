"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

import RoleGuard from "@/components/guards/RoleGuard";
import PartnerMobileBottomNav from "@/components/layout/PartnerMobileBottomNav";
import RoleSidebar from "@/components/layout/RoleSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useLogout } from "@/hooks/useLogout";
import { LogOut, FileText, ScrollText, Bell, LineChart, Package, ShieldCheck, CreditCard, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function PartnerShellRouter({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const { logout, isLoggingOut } = useLogout();
  
  const displayName = user?.name || "Partner";

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);

  return (
    <RoleGuard allowedRoles={["PARTNER"]}>
      <div className="relative overflow-x-clip bg-background min-h-screen max-w-[600px] mx-auto border-x border-border shadow-sm flex flex-col">
        {/* Mobile Top Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold tracking-tight text-foreground">Subidha Partner</div>
            <div className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
              {displayName}
            </div>
          </div>
          <button
            onClick={logout}
            disabled={isLoggingOut}
            className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Log out"
          >
            <LogOut className="size-4" />
          </button>
        </header>

        <main className="flex-1 pb-20">
          {children}
        </main>

        <PartnerMobileBottomNav pathname={pathname} onOpenMenu={openMobileMenu} />

        <RoleSidebar mobile mobileOpen={mobileMenuOpen} onOverlayClick={closeMobileMenu}>
          <div className="flex h-full flex-col overflow-y-auto p-4 bg-card text-card-foreground">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">More Options</h2>
                <p className="text-xs text-muted-foreground">{displayName}</p>
              </div>
              <button
                onClick={closeMobileMenu}
                className="rounded-full bg-muted p-2 text-muted-foreground transition hover:bg-muted/80"
              >
                <ChevronRight className="size-4 rotate-180" />
              </button>
            </div>

            <nav className="flex flex-col gap-2">
              <SidebarLink href="/partner/catalog" icon={Package} label="Product Catalog" onClick={closeMobileMenu} />
              <SidebarLink href="/partner/contract-amendments" icon={ScrollText} label="Contract Amendments" onClick={closeMobileMenu} />
              <SidebarLink href="/partner/kyc-requests" icon={ShieldCheck} label="KYC Requests" onClick={closeMobileMenu} />
              <SidebarLink href="/partner/payments" icon={CreditCard} label="Payments History" onClick={closeMobileMenu} />
              <SidebarLink href="/partner/payouts" icon={FileText} label="Payouts" onClick={closeMobileMenu} />
              <SidebarLink href="/partner/reports" icon={LineChart} label="Reports" onClick={closeMobileMenu} />
              <SidebarLink href="/partner/notifications" icon={Bell} label="Notifications" onClick={closeMobileMenu} />
            </nav>

            <div className="mt-auto pt-6 pb-4">
              <button
                onClick={() => {
                  closeMobileMenu();
                  logout();
                }}
                disabled={isLoggingOut}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive transition hover:bg-destructive/20 disabled:opacity-50"
              >
                <LogOut className="size-4" />
                Sign Out
              </button>
            </div>
          </div>
        </RoleSidebar>
      </div>
    </RoleGuard>
  );
}

function SidebarLink({ href, icon: Icon, label, onClick }: { href: string; icon: any; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted active:scale-95"
    >
      <Icon className="size-5 text-muted-foreground" />
      {label}
    </Link>
  );
}
