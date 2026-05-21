"use client";

import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  listCustomerNotifications,
  markNotificationRead,
} from "@/services/notifications";

export default function CustomerNotificationsPage() {
  return (
    <ERPPageShell
      eyebrow="Customer Self-Service"
      title="Notifications"
      subtitle="Your customer account alerts for invoices, receipts, due reminders, delivery updates, and service workflow updates."
      breadcrumbs={[
        { label: "Customer", href: ROUTES.customer.dashboard },
        { label: "Notifications" },
      ]}
      headerMode="erp"
    >
      <ERPSectionShell
        title="Inbox"
        description="System notifications scoped to your own contracts and operational history."
      >
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
          showHeader={false}
        />
      </ERPSectionShell>
    </ERPPageShell>
  );
}
