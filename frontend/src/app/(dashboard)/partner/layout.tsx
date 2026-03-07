import { type ReactNode } from "react";

import RoleLayout from "@/components/layout/RoleLayout";

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return (
    <RoleLayout
      title="Partner"
      links={[
        { href: "/partner/dashboard", label: "Dashboard" },
        { href: "/partner/customers", label: "Customers" },
        { href: "/partner/payouts", label: "Payouts" },
      ]}
    >
      {children}
    </RoleLayout>
  );
}
