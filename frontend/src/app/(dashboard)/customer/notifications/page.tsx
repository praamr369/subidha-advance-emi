"use client";

import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import { ROUTES } from "@/lib/routes";
import {
  listCustomerNotifications,
  markNotificationRead,
} from "@/services/notifications";

export default function CustomerNotificationsPage() {
  return (
    <div className="p-6">
      <NotificationCenterPanel
        role="customer"
        title="Notifications"
        subtitle="Your customer account alerts for invoices, receipts, due reminders, delivery updates, and service workflow updates."
        breadcrumbs={[
          { label: "Customer", href: ROUTES.customer.dashboard },
          { label: "Notifications" },
        ]}
        list={listCustomerNotifications}
        markRead={markNotificationRead}
      />
    </div>
  );
}
