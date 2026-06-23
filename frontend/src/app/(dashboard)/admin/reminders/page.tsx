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
import type { PaymentReminder } from "@/services/reminders";
import {
  cancelReminder,
  getWhatsAppReminderLink,
  listReminders,
  runPaymentReminders,
  scheduleReminder,
  sendReminder,
} from "@/services/reminders";

function nextHourIso() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export default function AdminRemindersPage() {
  const [rows, setRows] = useState<PaymentReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPage() {
    try {
      const payload = await listReminders();
      setRows(payload.results);
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
      setNotice(
        `Reminder run completed. Created ${payload.created_count}, skipped ${payload.skipped_count}.`
      );
      await loadPage();
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to run reminder generation."));
    }
  }

  const columns: EnterpriseColumnDef<PaymentReminder>[] = [
    { key: "due_date", header: "Due Date", render: (row) => accountingDate(row.due_date) },
    { key: "channel", header: "Channel" },
    { key: "reminder_type", header: "Type" },
    { key: "target_customer_name", header: "Customer" },
    { key: "amount_due", header: "Amount Due", render: (row) => accountingMoney(row.amount_due) },
    { key: "status", header: "Status" },
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
                  setNotice(`WhatsApp link opened for reminder #${row.id}. After sending, click "Mark Sent" to record it.`);
                } catch (err) {
                  setError(accountingErrorMessage(err, "Could not generate WhatsApp link."));
                }
              }}
            >
              Open WhatsApp
            </ActionButton>
          ) : null}
          {["DRAFT", "PENDING", "SCHEDULED"].includes(row.status) ? (
            <ConfirmActionButton
              label={row.channel === "EMAIL" ? "Send Email" : "Mark Sent"}
              title={row.channel === "EMAIL" ? `Send email reminder #${row.id}?` : `Mark reminder #${row.id} as sent?`}
              description={
                row.channel === "EMAIL"
                  ? "Dispatches an email to the customer via Django email backend and marks this reminder as sent."
                  : "Records that you manually sent this reminder (WhatsApp, call, etc.). Use after opening the WhatsApp link."
              }
              onConfirm={async () => {
                await sendReminder(row.id, "Sent manually from admin reminder queue.");
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
      ]}
      headerMode="erp"
    >
      <div className="space-y-4">
        {notice ? <AccountingNotice message={notice} /> : null}

        <ERPDataToolbar
          left={
            <div className="text-sm font-medium text-muted-foreground">
              Reminders can be scheduled, sent, or cancelled with explicit audit events.
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
            description="Track reminder statuses across scheduled dispatch, manual send, and cancellations."
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
            title="Safety & audit posture"
            description="Reminders are operational follow-ups; they must not mutate EMI, payment, or accounting records."
            className="xl:order-2"
          >
            <p className="text-sm leading-6 text-muted-foreground">
              Use this workspace for controlled dispatch. Financial posting stays inside Payments, Receipts, and Accounting
              workspaces.
            </p>
          </ERPActionPanel>
        </div>
      </div>
    </ERPPageShell>
  );
}
