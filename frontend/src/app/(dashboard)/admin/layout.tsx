"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

import RoleLayout from "@/components/layout/RoleLayout";

type NavLink = {
  href: string;
  label: string;
  group?: string;
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const links: NavLink[] = [
    // -------------------------
    // CORE DASHBOARD
    // -------------------------
    { href: "/admin/dashboard", label: "Dashboard", group: "Overview" },

    // -------------------------
    // CUSTOMER MANAGEMENT
    // -------------------------
    { href: "/admin/customers", label: "Customers", group: "Customers" },
    { href: "/admin/customers/create", label: "Create Customer", group: "Customers" },

    // -------------------------
    // SUBSCRIPTION MANAGEMENT
    // -------------------------
    { href: "/admin/subscriptions", label: "Subscriptions", group: "Subscriptions" },
    { href: "/admin/subscriptions/create", label: "Create Subscription", group: "Subscriptions" },

    // -------------------------
    // EMI OPERATIONS
    // -------------------------
    { href: "/admin/emi", label: "EMI Ledger", group: "EMI Operations" },
    { href: "/admin/emi/overdue", label: "Overdue EMIs", group: "EMI Operations" },

    // -------------------------
    // PAYMENTS
    // -------------------------
    { href: "/admin/payments", label: "Payments", group: "Payments" },
    { href: "/admin/payments/create", label: "Collect Payment", group: "Payments" },

    // -------------------------
    // BATCH + LUCKY DRAW
    // -------------------------
    { href: "/admin/batches", label: "Batches", group: "Lucky Plan" },
    { href: "/admin/batches/create", label: "Create Batch", group: "Lucky Plan" },
    { href: "/admin/lucky-draw", label: "Lucky Draw Records", group: "Lucky Plan" },

    // -------------------------
    // PARTNER MANAGEMENT
    // -------------------------
    { href: "/admin/partners", label: "Partners", group: "Partners" },
    { href: "/admin/partners/commissions", label: "Partner Commissions", group: "Partners" },

    // -------------------------
    // PRODUCT CATALOG
    // -------------------------
    { href: "/admin/products", label: "Products", group: "Catalog" },

    // -------------------------
    // ANALYTICS / REPORTING
    // -------------------------
    { href: "/admin/reports", label: "Reports", group: "Analytics" },

    // -------------------------
    // FUTURE EXPANSION MODULES
    // -------------------------
    { href: "/admin/risk", label: "Risk Monitor", group: "Analytics" },
    { href: "/admin/system-health", label: "System Health", group: "Analytics" },
  ];

  const groupedLinks = links.reduce<Record<string, NavLink[]>>((acc, link) => {
    const group = link.group || "General";
    if (!acc[group]) acc[group] = [];
    acc[group].push(link);
    return acc;
  }, {});

  return (
    <RoleLayout
      title="Admin Control Panel"
      links={links}
    >
      {children}
    </RoleLayout>
  );
}