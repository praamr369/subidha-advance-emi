"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { AccountingNotice, accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import type { PaymentReminder } from "@/services/reminders";
import {
  cancelReminder,
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
          {["DRAFT", "PENDING", "SCHEDULED"].includes(row.status) ? (
            <ConfirmActionButton
              label="Send"
              title={`Send reminder #${row.id}?`}
              description="Sending is auditable and marks the reminder as sent without claiming an external provider integration."
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
    <PortalPage
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
    >
      {notice ? <AccountingNotice message={notice} /> : null}

      <div className="mb-4 flex justify-end">
        <ActionButton variant="primary" disabled={loading} onClick={() => void handleRunGeneration()}>
          Run Reminder Generation
        </ActionButton>
      </div>

      <EnterpriseDataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No reminders in queue"
        emptyDescription="Create reminders from operational follow-up workflows or future scheduled reminder generation."
      />
    </PortalPage>
  );
}
