"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { API_BASE_URL } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import type { WhatsAppMessage, WhatsAppOutboxSummary } from "@/services/whatsapp";
import {
  composeWhatsAppMessage,
  getWhatsAppOutboxSummary,
  listWhatsAppMessages,
  markWhatsAppMessageSent,
  openWhatsAppMessage,
  skipWhatsAppMessage,
} from "@/services/whatsapp";

const STATUS_TABS = [
  { value: "PENDING", label: "To send" },
  { value: "SENT", label: "Sent" },
  { value: "SKIPPED", label: "Skipped" },
  { value: "", label: "All" },
];

const BUTTON =
  "inline-flex items-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

function feedUrl(): string {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const absolute = base.startsWith("http")
    ? base
    : typeof window !== "undefined"
      ? `${window.location.origin}${base}`
      : base;
  return `${absolute}/public/catalog/whatsapp-feed.csv`;
}

export default function WhatsAppOutboxPage() {
  const [rows, setRows] = useState<WhatsAppMessage[]>([]);
  const [summary, setSummary] = useState<WhatsAppOutboxSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [eventFilter, setEventFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [composeCustomer, setComposeCustomer] = useState("");
  const [composeText, setComposeText] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([
        listWhatsAppMessages({ status: statusFilter, event_type: eventFilter, page_size: 100 }),
        getWhatsAppOutboxSummary(),
      ]);
      setRows(list.results);
      setSummary(stats);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load the WhatsApp outbox.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, eventFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(id: number, fn: () => Promise<unknown>, done: string) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleOpen(row: WhatsAppMessage) {
    // Open the tab synchronously so the browser does not treat it as a popup.
    const tab = typeof window !== "undefined" ? window.open("", "_blank") : null;
    setBusyId(row.id);
    setError(null);
    try {
      const result = await openWhatsAppMessage(row.id);
      if (tab) {
        tab.opener = null;
        tab.location.href = result.link;
      } else {
        window.location.href = result.link;
      }
      setMessage("Opened in WhatsApp. Tap Send there, then click Mark sent here.");
      await load();
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Could not open WhatsApp.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCompose() {
    const customerId = Number(composeCustomer);
    if (!customerId || !composeText.trim()) {
      setError("Enter a customer ID and the message text.");
      return;
    }
    await run(0, () => composeWhatsAppMessage(customerId, composeText.trim()), "Message queued.");
    setComposeText("");
  }

  const columns: EnterpriseColumnDef<WhatsAppMessage>[] = useMemo(
    () => [
      {
        key: "customer_name",
        header: "Customer",
        render: (row) => (
          <div className="leading-tight">
            <div className="font-medium text-foreground">{row.customer_name || "—"}</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">+{row.phone_e164}</div>
            {!row.opted_in_snapshot ? (
              <div className="mt-1 text-[11px] text-amber-700">No WhatsApp opt-in on file</div>
            ) : null}
          </div>
        ),
      },
      {
        key: "event_label",
        header: "Event",
        render: (row) => (
          <div className="leading-tight">
            <div className="text-sm">{row.event_label}</div>
            {row.subscription_number ? (
              <div className="mt-0.5 text-[11px] text-muted-foreground">{row.subscription_number}</div>
            ) : null}
          </div>
        ),
      },
      {
        key: "body",
        header: "Message",
        cellClassName: "max-w-[420px]",
        render: (row) => <p className="line-clamp-3 text-xs text-muted-foreground">{row.body}</p>,
      },
      {
        key: "status",
        header: "Status",
        render: (row) => <ERPStatusBadge status={row.status} label={row.status_label} />,
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            {row.status === "QUEUED" || row.status === "OPENED" ? (
              <>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void handleOpen(row)}
                  className="inline-flex items-center rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
                >
                  Open in WhatsApp
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void run(row.id, () => markWhatsAppMessageSent(row.id), "Marked as sent.")}
                  className={BUTTON}
                >
                  Mark sent
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => {
                    const reason = window.prompt("Why skip this message?", "Not needed") ?? "";
                    if (!reason) return;
                    void run(row.id, () => skipWhatsAppMessage(row.id, reason), "Message skipped.");
                  }}
                  className={BUTTON}
                >
                  Skip
                </button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {row.status === "SENT"
                  ? `Sent${row.sent_by_username ? ` by ${row.sent_by_username}` : ""}`
                  : row.skip_reason}
              </span>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId],
  );

  return (
    <ERPPageShell
      eyebrow="Customer Messaging"
      title="WhatsApp Outbox"
      subtitle="Receipts, delivery updates, draw results, KYC decisions and reminders are prepared here automatically. Open each one in WhatsApp, tap Send, then confirm."
      helperNote="Messages are sent from your own WhatsApp Business app or WhatsApp Web through wa.me links. Nothing is sent automatically, so there is no API cost and your number stays on your phone."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reminders", href: ROUTES.admin.reminders },
        { label: "WhatsApp Outbox" },
      ]}
      stats={[
        { label: "To send", value: summary?.pending ?? 0, tone: (summary?.pending ?? 0) > 0 ? "warning" : "success" },
        { label: "Opened, not confirmed", value: summary?.opened ?? 0, tone: (summary?.opened ?? 0) > 0 ? "info" : "default" },
        { label: "Sent", value: summary?.sent ?? 0, tone: "success" },
        { label: "Skipped", value: summary?.skipped ?? 0, tone: "default" },
      ]}
    >
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      <ERPSectionShell title="Messages" description="Oldest actions first are at the bottom; the newest prepared messages are at the top.">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              type="button"
              aria-pressed={statusFilter === tab.value}
              onClick={() => {
                startTransition(() => {
                  setStatusFilter(tab.value);
                });
              }}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                statusFilter === tab.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
          <label htmlFor="event-filter" className="sr-only">Filter by event</label>
          <select
            id="event-filter"
            name="event-filter"
            value={eventFilter}
            onChange={(event) => {
              const val = event.target.value;
              startTransition(() => {
                setEventFilter(val);
              });
            }}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="">All events</option>
            {(summary?.event_types ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pageSize={50}
          globalFilterPlaceholder="Search customer, phone, message..."
          emptyTitle="Nothing to send"
          emptyDescription="New receipts, delivery updates and draw results appear here as they happen."
        />
      </ERPSectionShell>

      <div className="grid gap-5 xl:grid-cols-2">
        <ERPSectionShell title="Send a custom message" description="For any customer interaction without a ready-made template.">
          <div className="grid gap-3">
            <div className="grid gap-1 text-sm">
              <label htmlFor="compose-customer" className="font-medium">Customer ID</label>
              <input
                id="compose-customer"
                name="compose-customer"
                value={composeCustomer}
                onChange={(event) => {
                  const val = event.target.value.replace(/\D/g, "");
                  startTransition(() => {
                    setComposeCustomer(val);
                  });
                }}
                placeholder="e.g. 12"
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div className="grid gap-1 text-sm">
              <label htmlFor="compose-text" className="font-medium">Message</label>
              <textarea
                id="compose-text"
                name="compose-text"
                value={composeText}
                onChange={(event) => {
                  const val = event.target.value;
                  startTransition(() => {
                    setComposeText(val);
                  });
                }}
                rows={4}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <button type="button" onClick={() => void handleCompose()} className={BUTTON}>
                Queue message
              </button>
            </div>
          </div>
        </ERPSectionShell>

        <ERPSectionShell
          title="Product catalogue on WhatsApp"
          description="Keep your WhatsApp Business catalogue in sync with the website, free."
        >
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 break-all rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">{feedUrl()}</code>
              <button
                type="button"
                className={BUTTON}
                onClick={() => {
                  void navigator.clipboard.writeText(feedUrl()).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? "Copied" : "Copy feed URL"}
              </button>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Open Meta Commerce Manager and create a catalogue (type: Ecommerce).</li>
              <li>Add items with a data feed, choose scheduled feed, and paste the URL above. Set it to refresh daily.</li>
              <li>In WhatsApp Business: Settings, Business tools, Catalogue, and connect that Commerce Manager catalogue.</li>
              <li>Every product published on the website then shows in your WhatsApp catalogue, with price, photo and link.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Products without a photo or price are left out of the feed, because Meta rejects them.
            </p>
          </div>
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
