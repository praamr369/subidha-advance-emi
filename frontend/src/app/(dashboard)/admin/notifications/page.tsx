"use client";

import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import { ROUTES } from "@/lib/routes";
import {
  listAdminNotifications,
  markAdminNotificationRead,
} from "@/services/notifications";

export default function AdminNotificationsPage() {
  return (
    <div className="p-6">
      <NotificationCenterPanel
        role="admin"
        title="Notification center"
        subtitle="System alerts, billing jobs, accounting checks, and inventory signals addressed to your admin account."
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Notifications" },
        ]}
        list={listAdminNotifications}
        markRead={markAdminNotificationRead}
      />
    </div>
  );
}
