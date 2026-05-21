"use client";

import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import ERPPageHeader from "@/components/erp/ERPPageHeader";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { listVendorNotifications, markNotificationRead } from "@/services/notifications";

export default function VendorNotificationsPage() {
  return (
    <ERPPageShell
      title="Notifications"
      subtitle="Role-safe alerts for quote requests, purchase orders, purchase returns, and vendor payment updates."
      breadcrumbs={[
        { label: "Vendor", href: ROUTES.vendor.dashboard },
        { label: "Notifications" },
      ]}
    >
      <div className="space-y-4">
        <ERPPageHeader
          eyebrow="Vendor"
          title="Notification center"
          description="See vendor-scoped alerts and action items. Posting and approval actions remain in the corresponding ERP workflows."
        />
        <NotificationCenterPanel
          role="vendor"
          title="Vendor Notifications"
          subtitle="Role-safe alerts for quote requests, purchase orders, purchase returns, and vendor payment updates."
          breadcrumbs={[
            { label: "Vendor", href: ROUTES.vendor.dashboard },
            { label: "Notifications" },
          ]}
          list={listVendorNotifications}
          markRead={markNotificationRead}
          showHeader={false}
        />
      </div>
    </ERPPageShell>
  );
}
