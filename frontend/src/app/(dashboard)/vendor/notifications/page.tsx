"use client";

import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import { ROUTES } from "@/lib/routes";
import { listVendorNotifications, markNotificationRead } from "@/services/notifications";

export default function VendorNotificationsPage() {
  return (
    <div className="p-6">
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
      />
    </div>
  );
}
