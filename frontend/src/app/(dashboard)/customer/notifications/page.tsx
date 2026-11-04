"use client";

import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import CustomerPageShell from "@/components/layout/CustomerPageShell";
import { ROUTES } from "@/lib/routes";
import {
  archiveNotification,
  listCustomerNotifications,
  markNotificationRead,
} from "@/services/notifications";

export default function CustomerNotificationsPage() {
  return (
    <CustomerPageShell title="Notifications" subtitle="Alerts for payments, deliveries, and contract updates">
      <NotificationCenterPanel
        role="customer"
        title="Notifications"
        subtitle="Your customer account alerts"
        breadcrumbs={[
          { label: "Customer", href: ROUTES.customer.dashboard },
          { label: "Notifications" },
        ]}
        list={listCustomerNotifications}
        markRead={markNotificationRead}
        archive={archiveNotification}
        showHeader={false}
      />
    </CustomerPageShell>
  );
}
