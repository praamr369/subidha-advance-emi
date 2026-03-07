"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

type NavLink = { href: string; label: string };

const roleNav: Record<string, NavLink[]> = {
  ADMIN: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/customers", label: "Customers" },
    { href: "/admin/subscriptions", label: "Subscriptions" },
    { href: "/admin/emi", label: "EMI" },
    { href: "/admin/lucky-draw", label: "Lucky Draw" },
    { href: "/admin/partners", label: "Partners" },
    { href: "/admin/reports", label: "Reports" },
  ],
  PARTNER: [
    { href: "/partner", label: "Overview" },
    { href: "/partner/customers", label: "Customers" },
    { href: "/partner/subscriptions", label: "Subscriptions" },
    { href: "/partner/commissions", label: "Commissions" },
  ],
  CUSTOMER: [
    { href: "/customer", label: "Overview" },
    { href: "/customer/dashboard", label: "Dashboard" },
    { href: "/products", label: "Products" },
    { href: "/winners", label: "Winner History" },
  ],
  CASHIER: [
    { href: "/cashier/dashboard", label: "Dashboard" },
    { href: "/cashier/collect", label: "Collect Payment" },
  ],
};

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

type DashboardLayoutProps = {
  children: ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();

  const token = hydrated ? localStorage.getItem("access_token") : null;
  const role = hydrated ? (localStorage.getItem("user_role") || "").toUpperCase() : "";

  useEffect(() => {
    if (!hydrated) return;

    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (pathname.startsWith("/admin") && role !== "ADMIN") {
      router.replace("/unauthorized");
      return;
    }

    if (pathname.startsWith("/partner") && role !== "PARTNER") {
      router.replace("/unauthorized");
      return;
    }

    if (pathname.startsWith("/customer") && role !== "CUSTOMER") {
      router.replace("/unauthorized");
      return;
    }

    if (pathname.startsWith("/cashier") && role !== "CASHIER" && role !== "ADMIN") {
      router.replace("/unauthorized");
    }
  }, [hydrated, pathname, role, router, token]);

  const blocked =
    !hydrated ||
    !token ||
    (pathname.startsWith("/admin") && role !== "ADMIN") ||
    (pathname.startsWith("/partner") && role !== "PARTNER") ||
    (pathname.startsWith("/customer") && role !== "CUSTOMER") ||
    (pathname.startsWith("/cashier") && role !== "CASHIER" && role !== "ADMIN");

  const links = useMemo(() => roleNav[role] || [], [role]);

  if (blocked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex w-full max-w-[1400px] gap-4 p-4">
        <aside className="sticky top-4 h-[calc(100vh-2rem)] w-64 rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-gray-500">CONTROL PANEL</p>
          <h2 className="mb-4 text-lg font-bold">{role || "Dashboard"}</h2>
          <nav className="space-y-2">
            {links.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 border-t pt-4">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              Go to Public Site
            </button>
          </div>
        </aside>

        <section className="min-w-0 flex-1 rounded-xl border bg-white shadow-sm">{children}</section>
      </div>
    </div>
  );
}
