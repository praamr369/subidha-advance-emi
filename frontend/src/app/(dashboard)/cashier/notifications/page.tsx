"use client";

import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  listCashierNotifications,
  markCashierNotificationRead,
} from "@/services/notifications";

export default function CashierNotificationsPage() {
  return (
    <div className="p-4 sm:p-6">
      <ERPSectionShell className="p-0">
      <NotificationCenterPanel
        role="cashier"
        title="Notifications"
        subtitle="Alerts assigned to your cashier profile. You will not see other users’ in-app messages."
        breadcrumbs={[
          { label: "Cashier", href: ROUTES.cashier.dashboard },
          { label: "Notifications" },
        ]}
        list={listCashierNotifications}
        markRead={markCashierNotificationRead}
      />
      </ERPSectionShell>
    </div>
  );
}
