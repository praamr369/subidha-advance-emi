"use client";

import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import CustomerPageShell from "@/components/layout/CustomerPageShell";
import { ROUTES } from "@/lib/routes";
import {
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
        showHeader={false}
      />
    </CustomerPageShell>
  );
}
