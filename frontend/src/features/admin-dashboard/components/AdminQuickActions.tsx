"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { ROUTES } from "@/lib/routes";

export default function AdminQuickActions() {
  const actions = [
    { label: "Subscription Sale", href: ROUTES.admin.subscriptionsAdvanceEmiCreate },
    { label: "Direct Sale Desk", href: ROUTES.admin.billingDirectSales },
    { label: "Collections", href: ROUTES.admin.collections },
    { label: "Supplier Payables", href: ROUTES.admin.accountingVendors },
  ];

  return (
    <>
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          {action.label}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      ))}
    </>
  );
}
