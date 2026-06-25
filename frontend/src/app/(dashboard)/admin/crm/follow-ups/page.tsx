"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  getInternalCrmFollowUps,
  completeFollowUpTask,
  cancelFollowUpTask,
  updateFollowUpCallNote,
  type FollowUpTask,
} from "@/services/crm-module";

type StatusFilter = "" | "OPEN" | "DONE" | "CANCELLED";

function formatDt(value?: string | null) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString("en-IN"); } catch { return value; }
}

function TaskRow({
  task,
  onComplete,
  onCancel,
  onNoteUpdate,
}: {
  task: FollowUpTask;
  onComplete: (id: number, note: string) => Promise<void>;
  onCancel: (id: number) => Promise<void>;
  onNoteUpdate: (id: number, note: string) => Promise<void>;
}) {
  const [noteEdit, setNoteEdit] = useState(false);
  const [note, setNote] = useState(task.call_note || "");
  const [completeNote, setCompleteNote] = useState("");
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const isOpen = task.status === "OPEN";

  async function handleComplete() {
    setBusy(true);
    try {
      await onComplete(task.id, completeNote);
      setShowCompleteForm(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel this follow-up task?")) return;
    setBusy(true);
    try { await onCancel(task.id); }
    finally { setBusy(false); }
  }

  async function handleNoteSave() {
    setBusy(true);
    try {
      await onNoteUpdate(task.id, note);
      setNoteEdit(false);
    } finally {
      setBusy(false);
    }
  }

  const statusBadge =
    task.status === "DONE"
      ? "bg-green-100 text-green-700"
      : task.status === "CANCELLED"
      ? "bg-gray-100 text-muted-foreground"
      : task.is_overdue
      ? "bg-orange-100 text-orange-700"
      : "bg-blue-100 text-blue-700";

  const statusLabel =
    task.status === "DONE"
      ? "Done"
      : task.status === "CANCELLED"
      ? "Cancelled"
      : task.is_overdue
      ? "Overdue"
      : "Open";

  return (
    <tr className="border-t border-border/60 align-top">
      <td className="px-4 py-3">
        <div className="font-medium text-foreground">#{task.id}</div>
        {task.lead_name ? (
          <Link
            href={`${ROUTES.admin.crmLeads}/${task.lead}`}
            className="text-xs text-primary hover:underline underline-offset-4"
          >
            {task.lead_name}
          </Link>
        ) : (
          <Link
            href={`${ROUTES.admin.crmLeads}/${task.lead}`}
            className="text-xs text-primary hover:underline underline-offset-4"
          >
            Lead #{task.lead}
          </Link>
        )}
        {task.assigned_to_username ? (
          <div className="text-xs text-muted-foreground mt-0.5">→ {task.assigned_to_username}</div>
        ) : null}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className={task.is_overdue && task.status === "OPEN" ? "text-orange-600 font-semibold" : "text-foreground"}>
          {formatDt(task.due_at)}
        </div>
        {task.completed_at ? (
          <div className="text-xs text-muted-foreground mt-0.5">Done: {formatDt(task.completed_at)}</div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadge}`}>
          {statusLabel}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs">
        {noteEdit ? (
          <div className="flex gap-2 items-start">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="flex-1 h-8 rounded-lg border border-border bg-background px-2 text-xs"
              onKeyDown={(e) => { if (e.key === "Enter") void handleNoteSave(); }}
              autoFocus
            />
            <button
              disabled={busy}
              onClick={() => void handleNoteSave()}
              className="h-8 rounded-lg border border-primary bg-primary px-2 text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "…" : "Save"}
            </button>
            <button
              onClick={() => { setNoteEdit(false); setNote(task.call_note || ""); }}
              className="h-8 rounded-lg border border-border px-2 text-[10px] hover:bg-muted"
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            className="cursor-pointer hover:text-foreground transition-colors"
            onClick={() => isOpen && setNoteEdit(true)}
            title={isOpen ? "Click to edit note" : undefined}
          >
            {task.call_note || <span className="italic text-muted-foreground/60">No note</span>}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {isOpen ? (
          <div className="flex flex-col gap-1.5">
            {showCompleteForm ? (
              <div className="flex gap-1.5 items-center">
                <input
                  type="text"
                  value={completeNote}
                  onChange={(e) => setCompleteNote(e.target.value)}
                  placeholder="Call note (optional)"
                  className="h-7 w-36 rounded-lg border border-border bg-background px-2 text-xs"
                  onKeyDown={(e) => { if (e.key === "Enter") void handleComplete(); }}
                  autoFocus
                />
                <button
                  disabled={busy}
                  onClick={() => void handleComplete()}
                  className="h-7 rounded-lg border border-green-600 bg-green-600 px-2 text-[10px] font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "…" : "Confirm"}
                </button>
                <button
                  onClick={() => setShowCompleteForm(false)}
                  className="h-7 rounded-lg border border-border px-2 text-[10px] hover:bg-muted"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                disabled={busy}
                onClick={() => setShowCompleteForm(true)}
                className="h-7 rounded-lg border border-green-600 bg-green-50 px-3 text-[10px] font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                Mark Done
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => void handleCancel()}
              className="h-7 rounded-lg border border-border px-3 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export default function AdminCrmFollowUpsPage() {
  const [rows, setRows] = useState<FollowUpTask[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getInternalCrmFollowUps({
        status: statusFilter || undefined,
        page,
        page_size: 50,
      });
      setRows(payload.results);
      setOverdueCount(payload.overdue_count);
      setTotalCount(payload.count);
      setTotalPages(payload.total_pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load follow-up queue.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { void load(); }, [load]);

  const handleComplete = useCallback(async (id: number, note: string) => {
    await completeFollowUpTask(id, note || undefined);
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: "DONE" as const, completed_at: new Date().toISOString(), call_note: note || r.call_note } : r
      )
    );
    if (statusFilter === "OPEN") {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  }, [statusFilter]);

  const handleCancel = useCallback(async (id: number) => {
    await cancelFollowUpTask(id);
    if (statusFilter === "OPEN") {
      setRows((prev) => prev.filter((r) => r.id !== id));
    } else {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "CANCELLED" as const, completed_at: new Date().toISOString() } : r))
      );
    }
  }, [statusFilter]);

  const handleNoteUpdate = useCallback(async (id: number, note: string) => {
    await updateFollowUpCallNote(id, note);
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, call_note: note } : r))
    );
  }, []);

  const openCount = rows.filter((r) => r.status === "OPEN").length;
  const doneCount = rows.filter((r) => r.status === "DONE").length;

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="CRM Follow-ups"
      subtitle="Follow-up task queue. Mark tasks done after each call or outreach attempt."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "Follow-ups" },
      ]}
      stats={[
        { label: "Overdue", value: String(overdueCount), tone: overdueCount > 0 ? "warning" : "success" },
        { label: "Open", value: String(openCount), tone: "info" },
        { label: "Done", value: String(doneCount), tone: "default" },
        { label: "Total", value: String(totalCount), tone: "default" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <ERPSectionShell
        title="Follow-up queue"
        description="Click 'Mark Done' after calling — add a call note before confirming. Notes on open tasks are click-to-edit."
      >
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <div className="flex rounded-xl border border-border overflow-hidden">
            {(["OPEN", "", "DONE", "CANCELLED"] as StatusFilter[]).map((s) => {
              const label = s === "" ? "All" : s === "OPEN" ? "Open" : s === "DONE" ? "Done" : "Cancelled";
              return (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => void load()}
            className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Refresh
          </button>
          <Link
            href={ROUTES.admin.crmLeads}
            className="ml-auto flex h-9 items-center rounded-xl border border-border bg-background px-4 text-sm hover:bg-muted"
          >
            Lead Register
          </Link>
        </div>

        {loading ? <ERPLoadingState label="Loading follow-ups…" /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load follow-ups" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState
            title="No follow-up tasks"
            description={statusFilter === "OPEN" ? "No open follow-ups pending right now." : "No tasks match the selected filter."}
          />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Task / Lead</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Call Note</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onComplete={handleComplete}
                    onCancel={handleCancel}
                    onNoteUpdate={handleNoteUpdate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Page {page} of {totalPages} · {totalCount} tasks</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-9 rounded-xl border border-border bg-background px-4 font-medium hover:bg-muted disabled:opacity-40">
                ← Prev
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="h-9 rounded-xl border border-border bg-background px-4 font-medium hover:bg-muted disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
