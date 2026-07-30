"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

import RoleGuard from "@/components/guards/RoleGuard";
import CustomerMobileBottomNav from "@/components/layout/CustomerMobileBottomNav";
import RoleSidebar from "@/components/layout/RoleSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useLogout } from "@/hooks/useLogout";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Gift,
  HelpCircle,
  LogOut,
  Package,
  RefreshCw,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Star,
  Truck,
  User,
} from "lucide-react";
import Link from "next/link";

function isPrintDocumentRoute(pathname: string): boolean {
  return /\/print\/?$/.test(pathname) || /\/contract\/print\/?$/.test(pathname);
}

export default function CustomerShellRouter({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const { logout, isLoggingOut } = useLogout();

  const displayName = user?.name || "Customer";
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);

  if (isPrintDocumentRoute(pathname)) {
    return <RoleGuard allowedRoles={["CUSTOMER"]}>{children}</RoleGuard>;
  }

  return (
    <RoleGuard allowedRoles={["CUSTOMER"]}>
      <div className="relative overflow-x-clip bg-background min-h-screen max-w-[600px] mx-auto border-x border-border shadow-sm flex flex-col">
        {/* Mobile Top Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold tracking-tight text-foreground">Subidha</div>
            <div className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
              {displayName}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/customer/notifications"
              className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title="Notifications"
            >
              <Bell className="size-4" />
            </Link>
            <button
              onClick={logout}
              disabled={isLoggingOut}
              className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              title="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 pb-20">
          {children}
        </main>

        <CustomerMobileBottomNav pathname={pathname} onOpenMenu={openMobileMenu} />

        <RoleSidebar mobile mobileOpen={mobileMenuOpen} onOverlayClick={closeMobileMenu}>
          <div className="flex h-full flex-col overflow-y-auto bg-card text-card-foreground">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 pt-5 pb-4 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-foreground">All Sections</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{displayName}</p>
              </div>
              <button
                onClick={closeMobileMenu}
                className="rounded-full bg-muted p-2 text-muted-foreground transition hover:bg-muted/80"
              >
                <ChevronRight className="size-4 rotate-180" />
              </button>
            </div>

            <nav className="flex flex-col gap-1 p-3">
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Catalog & Shop</p>
              <SidebarLink href="/customer/catalog" icon={Package} label="Product Catalog" onClick={closeMobileMenu} />

              <p className="px-3 py-2 pt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contracts & Plans</p>
              <SidebarLink href="/customer/contracts" icon={ScrollText} label="My Contracts" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/subscriptions" icon={Package} label="Subscriptions" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/product-requests" icon={ClipboardList} label="Product Requests" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/contract-amendments" icon={RefreshCw} label="Amendments" onClick={closeMobileMenu} />

              <p className="px-3 py-2 pt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payments</p>
              <SidebarLink href="/customer/emis" icon={CreditCard} label="EMI Schedule" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/payments" icon={CreditCard} label="Payments & Receipts" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/payment-schedule" icon={FileText} label="Payment Schedule" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/invoices" icon={FileText} label="Invoices" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/receipts" icon={FileText} label="Receipts" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/account-statement" icon={FileText} label="Account Statement" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/finance" icon={FileText} label="Finance Summary" onClick={closeMobileMenu} />

              <p className="px-3 py-2 pt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Lucky Plan</p>
              <SidebarLink href="/customer/lucky-plan/lucky-id" icon={Star} label="My Lucky ID" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/lucky-plan/eligibility" icon={Gift} label="Draw Eligibility" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/lucky-draws" icon={Gift} label="Draw Results" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/lucky-plan/history" icon={Star} label="Draw History" onClick={closeMobileMenu} />

              <p className="px-3 py-2 pt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Delivery & Returns</p>
              <SidebarLink href="/customer/deliveries" icon={Truck} label="Deliveries" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/direct-sales" icon={Package} label="Direct Sales" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/returns" icon={RotateCcw} label="Returns" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/refunds/history" icon={RotateCcw} label="Refunds" onClick={closeMobileMenu} />

              <p className="px-3 py-2 pt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Warranty & Support</p>
              <SidebarLink href="/customer/warranty/status/check" icon={ShieldCheck} label="Warranty Status" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/warranty/claim" icon={ShieldCheck} label="Warranty Claim" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/support" icon={HelpCircle} label="Support Tickets" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/reviews" icon={Star} label="My Reviews" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/referrals" icon={Gift} label="Referrals" onClick={closeMobileMenu} />

              <p className="px-3 py-2 pt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Account</p>
              <SidebarLink href="/customer/profile" icon={User} label="My Profile" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/kyc" icon={ShieldCheck} label="KYC Documents" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/documents" icon={FileText} label="Documents" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/notifications" icon={Bell} label="Notifications" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/comms/preferences" icon={Bell} label="Comm. Preferences" onClick={closeMobileMenu} />
              <SidebarLink href="/customer/privacy/dashboard" icon={ShieldCheck} label="Privacy Dashboard" onClick={closeMobileMenu} />
            </nav>

            <div className="mt-auto px-3 pb-6 pt-4 border-t border-border">
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

function SidebarLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted active:scale-95"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      {label}
    </Link>
  );
}
