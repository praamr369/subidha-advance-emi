"use client";

import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  listPartnerNotifications,
  markNotificationRead,
} from "@/services/notifications";

export default function PartnerNotificationsPage() {
  return (
    <ERPPageShell
      eyebrow="Partner Operations"
      title="Notifications"
      subtitle="Operational alerts scoped to your partner-linked customers, subscriptions, commissions, and collection requests."
      breadcrumbs={[
        { label: "Partner", href: ROUTES.partner.dashboard },
        { label: "Notifications" },
      ]}
      statusBadge={{ label: "Partner scope", tone: "info" }}
    >
      <NotificationCenterPanel
        role="partner"
        title="Partner Notifications"
        subtitle="Operational alerts for your partner-linked customers, subscriptions, commissions, and collection requests."
        breadcrumbs={[]}
        list={listPartnerNotifications}
        markRead={markNotificationRead}
      />
    </ERPPageShell>
  );
}
