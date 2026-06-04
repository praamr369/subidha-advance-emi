"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import RoleGuard from "@/components/guards/RoleGuard";
import { ROUTES } from "@/lib/routes";

const STAFF_NAV = [
  { href: ROUTES.staff.dashboard, label: "Dashboard" },
  { href: ROUTES.staff.profile, label: "My Profile" },
  { href: ROUTES.staff.attendance, label: "Attendance" },
  { href: ROUTES.staff.payslips, label: "Payslips" },
  { href: ROUTES.staff.salary, label: "Salary Summary" },
  { href: ROUTES.staff.reports, label: "My Reports" },
  { href: ROUTES.staff.tasks, label: "Assigned Work" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === ROUTES.staff.dashboard) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function StaffShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";

  return (
    <RoleGuard allowedRoles={["STAFF"]}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card/95 px-4 py-4 shadow-sm">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subidha staff portal</div>
              <div className="text-lg font-semibold text-foreground">My work, attendance, and payroll</div>
            </div>
            <nav className="flex flex-wrap gap-2">
              {STAFF_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    isActive(pathname, item.href)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    </RoleGuard>
  );
}
