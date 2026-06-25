"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { AccountingNotice, accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import ERPActionPanel from "@/components/erp/ERPActionPanel";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import ActionButton from "@/components/ui/ActionButton";
import { ROUTES } from "@/lib/routes";
import type { PaymentReminder, ReminderGatewayStatus } from "@/services/reminders";
import {
  cancelReminder,
  dispatchReminder,
  getReminderGatewayStatus,
  getWhatsAppReminderLink,
  listReminders,
  retryReminder,
  runPaymentReminders,
  scheduleReminder,
  sendReminder,
} from "@/services/reminders";

function nextHourIso() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-gray-100 text-muted-foreground" },
  PENDING: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  SCHEDULED: { label: "Scheduled", className: "bg-blue-100 text-blue-800" },
  SENT: { label: "Sent", className: "bg-green-100 text-green-800" },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-700" },
  ACKNOWLEDGED: { label: "Acknowledged", className: "bg-emerald-100 text-emerald-800" },
  CANCELLED: { label: "Cancelled", className: "bg-gray-200 text-muted-foreground" },
};

const CHANNEL_BADGE: Record<string, { label: string; className: string }> = {
  EMAIL: { label: "Email", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  WHATSAPP: { label: "WhatsApp", className: "bg-green-50 text-green-700 border-green-200" },
  SMS: { label: "SMS", className: "bg-orange-50 text-orange-700 border-orange-200" },
  CALL: { label: "Call", className: "bg-purple-50 text-purple-700 border-purple-200" },
  INTERNAL: { label: "Internal", className: "bg-gray-50 text-muted-foreground border-gray-200" },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_BADGE[status] ?? { label: status, className: "bg-gray-100 text-muted-foreground" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${info.className}`}>
      {info.label}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const info = CHANNEL_BADGE[channel] ?? { label: channel, className: "bg-gray-50 text-muted-foreground border-gray-200" };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${info.className}`}>
      {info.label}
    </span>
  );
}

function sendLabel(channel: string): string {
  switch (channel) {
    case "EMAIL": return "Send Email";
    case "WHATSAPP": return "Mark Manually Sent";
    case "CALL": return "Mark Call Made";
    default: return "Mark Sent";
  }
}

function sendDescription(channel: string): string {
  switch (channel) {
    case "EMAIL":
      return "Dispatches an email to the customer via Django email backend and marks this reminder as sent.";
    case "WHATSAPP":
      return "Records that you manually sent this WhatsApp message. Use after opening the WhatsApp link and confirming delivery. This is NOT automatic delivery.";
    case "CALL":
      return "Records that you made this call to the customer.";
    default:
      return "Records that this reminder was sent.";
  }
}

function gatewayConfigured(gateway: ReminderGatewayStatus | null, channel: string): boolean {
  return Boolean(gateway?.channels?.[channel]?.configured);
}

export default function AdminRemindersPage() {
  const [rows, setRows] = useState<PaymentReminder[]>([]);
  const [gateway, setGateway] = useState<ReminderGatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPage() {
    try {
      const [payload, gatewayPayload] = await Promise.all([
        listReminders(),
        getReminderGatewayStatus(),
      ]);
      setRows(payload.results);
      setGateway(gatewayPayload);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load reminders."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  async function handleRunGeneration() {
    try {
      const payload = await runPaymentReminders({ send_now: false });
      const msg = `Reminder run completed. Created ${payload.created_count}, skipped ${payload.skipped_count}.`;
      setNotice(msg);
      try {
        await loadPage();
        setTimeout(() => setNotice(null), 5000);
      } catch (loadErr) {
        setNotice(null);
        setError(accountingErrorMessage(loadErr, "Failed to load updated reminders."));
      }
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to run reminder generation."));
    }
  }

  const columns: EnterpriseColumnDef<PaymentReminder>[] = [
    { key: "due_date", header: "Due Date", render: (row) => accountingDate(row.due_date) },
    {
      key: "channel",
      header: "Channel",
      render: (row) => <ChannelBadge channel={row.channel} />,
    },
    { key: "reminder_type", header: "Type" },
    { key: "target_customer_name", header: "Customer" },
    { key: "amount_due", header: "Amount Due", render: (row) => accountingMoney(row.amount_due) },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="space-y-1">
          <StatusBadge status={row.status} />
          {row.status === "FAILED" && row.last_error ? (
            <div className="text-xs text-red-600 max-w-[200px] truncate" title={row.last_error}>
              {row.last_error}
            </div>
          ) : null}
          {row.status === "FAILED" && (row.attempts ?? 0) > 0 ? (
            <div className="text-xs text-muted-foreground">
              Attempt {row.attempts}/3
            </div>
          ) : null}
          {row.status === "SENT" && row.channel === "WHATSAPP" ? (
            <div className="text-xs text-amber-600">Manual send</div>
          ) : null}
        </div>
      ),
    },
    { key: "scheduled_for", header: "Scheduled", render: (row) => accountingDate(row.scheduled_for) },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {["DRAFT", "PENDING"].includes(row.status) ? (
            <ConfirmActionButton
              label="Schedule"
              title={`Schedule reminder #${row.id}?`}
              description="This will move the reminder into the scheduled queue with a near-term dispatch timestamp."
              onConfirm={async () => {
                await scheduleReminder(row.id, nextHourIso());
                await loadPage();
              }}
              variant="secondary"
            />
          ) : null}
          {["DRAFT", "PENDING", "SCHEDULED"].includes(row.status) && row.channel === "WHATSAPP" ? (
            <ActionButton
              variant="secondary"
              onClick={async () => {
                try {
                  const res = await getWhatsAppReminderLink(row.id);
                  window.open(res.link, "_blank", "noopener,noreferrer");
                  setNotice(`WhatsApp link opened for reminder #${row.id}. After sending in WhatsApp, click "${sendLabel(row.channel)}" to record it.`);
                } catch (err) {
                  setError(accountingErrorMessage(err, "Could not generate WhatsApp link. Click again to retry."));
                }
              }}
            >
              Open WhatsApp
            </ActionButton>
          ) : null}
          {["DRAFT", "PENDING", "SCHEDULED", "FAILED"].includes(row.status) && ["EMAIL", "SMS", "WHATSAPP"].includes(row.channel) && (row.channel === "EMAIL" || gatewayConfigured(gateway, row.channel)) ? (
            <ConfirmActionButton
              label={row.channel === "EMAIL" ? "Send Email" : `Dispatch ${row.channel}`}
              title={`Dispatch reminder #${row.id}?`}
              description={row.channel === "EMAIL" ? "Sends through the configured Django email backend." : "Sends through the configured reminder gateway and records the provider result in the audit trail."}
              onConfirm={async () => {
                await dispatchReminder(row.id, `Automated ${row.channel} dispatch from admin reminder queue.`);
                await loadPage();
              }}
              variant="primary"
            />
          ) : null}
          {["DRAFT", "PENDING", "SCHEDULED"].includes(row.status) ? (
            <ConfirmActionButton
              label={sendLabel(row.channel)}
              title={`${sendLabel(row.channel)} for reminder #${row.id}?`}
              description={sendDescription(row.channel)}
              onConfirm={async () => {
                await sendReminder(row.id, `${sendLabel(row.channel)} from admin reminder queue.`);
                await loadPage();
              }}
              variant="primary"
            />
          ) : null}
          {row.status === "FAILED" && (row.attempts ?? 0) < 3 ? (
            <ConfirmActionButton
              label="Retry"
              title={`Retry failed reminder #${row.id}?`}
              description={`Attempt ${(row.attempts ?? 0) + 1} of 3. Will re-attempt ${row.channel === "EMAIL" ? "email delivery" : "sending"}.`}
              onConfirm={async () => {
                try {
                  await retryReminder(row.id);
                  setNotice(`Retry successful for reminder #${row.id}.`);
                } catch (err) {
                  setError(accountingErrorMessage(err, `Retry failed for reminder #${row.id}.`));
                }
                await loadPage();
              }}
              variant="primary"
            />
          ) : null}
          {!["SENT", "CANCELLED"].includes(row.status) ? (
            <ConfirmActionButton
              label="Cancel"
              title={`Cancel reminder #${row.id}?`}
              description="Cancellation preserves the reminder record and audit trail."
              onConfirm={async () => {
                await cancelReminder(row.id, "Cancelled from admin reminder queue.");
                await loadPage();
              }}
              variant="destructive"
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Reminder Queue"
      subtitle="Manual and scheduled reminders for retail dues and Lucky Plan EMI collections, with explicit status tracking and audit events."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reminders" },
      ]}
      statusBadge={{ label: "Audit Enabled", tone: "info" }}
      stats={[
        { label: "Queue Size", value: String(rows.length), tone: "info" },
        { label: "Scheduled", value: String(rows.filter((row) => row.status === "SCHEDULED").length), tone: "warning" },
        { label: "Sent", value: String(rows.filter((row) => row.status === "SENT").length), tone: "success" },
        { label: "Failed", value: String(rows.filter((row) => row.status === "FAILED").length), tone: rows.some((row) => row.status === "FAILED") ? "danger" : "default" },
      ]}
      actions={[
        { href: ROUTES.admin.remindersPaymentReminders, label: "Payment Reminders", variant: "secondary" },
        { href: ROUTES.admin.notificationTemplates, label: "Message Templates", variant: "secondary" },
      ]}
      headerMode="erp"
    >
      <div className="space-y-4">
        {notice ? <AccountingNotice message={notice} /> : null}

        <ERPDataToolbar
          left={
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Gateway:</span> {gateway?.provider ?? "loading"}.{" "}
              <span className="font-medium">Automated:</span> {gateway?.automated_dispatch_available ? "available for configured channels" : "not configured"}.{" "}
              <span className="font-medium">Failed:</span> retry up to 3 times.
            </div>
          }
          right={
            <ActionButton variant="primary" disabled={loading} onClick={() => void handleRunGeneration()}>
              Run Reminder Generation
            </ActionButton>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <ERPSectionShell
            title="Queue register"
            description="Track reminder statuses across scheduled dispatch, manual send, retry, and cancellations."
            className="xl:order-1"
          >
            <EnterpriseDataTable
              data={rows}
              columns={columns}
              loading={loading}
              error={error}
              emptyTitle="No reminders in queue"
              emptyDescription="Create reminders from operational follow-up workflows or future scheduled reminder generation."
            />
          </ERPSectionShell>

          <ERPActionPanel
            title="Channel guide"
            description="How each channel works in this system."
            className="xl:order-2"
          >
            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <div>
                <ChannelBadge channel="EMAIL" />{" "}
                <span className="ml-1">Sent via Django email backend. Failures set status to FAILED with error details. Retry up to 3 times.</span>
              </div>
              <div>
                <ChannelBadge channel="WHATSAPP" />{" "}
                <span className="ml-1">{gatewayConfigured(gateway, "WHATSAPP") ? "Automated gateway dispatch is configured. Manual wa.me fallback remains available for staff confirmation." : "Gateway not configured. Use wa.me manual fallback, then mark manually sent."}</span>
              </div>
              <div>
                <ChannelBadge channel="SMS" />{" "}
                <span className="ml-1">{gatewayConfigured(gateway, "SMS") ? "Automated SMS gateway dispatch is configured." : "SMS gateway is not configured."}</span>
              </div>
              <div>
                <ChannelBadge channel="CALL" />{" "}
                <span className="ml-1">Record that a call was made. No auto-dialing.</span>
              </div>
            </div>
          </ERPActionPanel>
        </div>
      </div>
    </ERPPageShell>
  );
}
