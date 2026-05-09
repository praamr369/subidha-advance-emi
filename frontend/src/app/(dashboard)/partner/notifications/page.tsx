"use client";

import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import { ROUTES } from "@/lib/routes";
import {
  listPartnerNotifications,
  markNotificationRead,
} from "@/services/notifications";

export default function PartnerNotificationsPage() {
  return (
    <div className="p-6">
      <NotificationCenterPanel
        role="partner"
        title="Partner Notifications"
        subtitle="Operational alerts for your partner-linked customers, subscriptions, commissions, and collection requests."
        breadcrumbs={[
          { label: "Partner", href: ROUTES.partner.dashboard },
          { label: "Notifications" },
        ]}
        list={listPartnerNotifications}
        markRead={markNotificationRead}
      />
    </div>
  );
}
