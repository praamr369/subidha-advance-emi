
"use client";

import { useRouter } from "next/navigation";

import PortalPage from "@/components/ui/portal-page";
import { logout } from "@/lib/api";

export default function PartnerDashboardPage() {
  const router = useRouter();

  return (
    <PortalPage
      title="Partner Portal"
      subtitle="Step workflow: login → register customers → create subscriptions → review commissions."
      actions={[
        { href: "/partner/customers", label: "1. Register/Manage Customers" },
        { href: "/partner/subscriptions", label: "2. Create Subscription" },
        { href: "/partner/commissions", label: "3. Commission Ledger" },
      ]}
    >
      <button type="button" onClick={() => { logout(); router.push('/login'); }}>Logout</button>
    </PortalPage>
  );
}
