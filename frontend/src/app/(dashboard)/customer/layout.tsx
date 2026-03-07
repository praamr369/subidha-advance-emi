import { type ReactNode } from "react";

import RoleLayout from "@/components/layout/RoleLayout";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <RoleLayout
      title="Customer"
      links={[
        { href: "/customer/dashboard", label: "Dashboard" },
        { href: "/customer/subscriptions", label: "Subscriptions" },
        { href: "/customer/payments", label: "Payments" },
        { href: "/customer/profile", label: "Profile" },
      ]}
    >
      {children}
    </RoleLayout>
  );
}
