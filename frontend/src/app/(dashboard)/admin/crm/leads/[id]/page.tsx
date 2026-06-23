"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  getInternalLeadDetail,
  moveLeadStage,
  assignLead,
  convertLead,
  createLeadTask,
  completeFollowUpTask,
  cancelFollowUpTask,
  createOpportunity,
  updateOpportunityStage,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_SOURCE_LABELS,
  type InternalLeadDetail,
  type LeadStage,
  type FollowUpTask,
  type Opportunity,
} from "@/services/crm-module";

function formatDt(value?: string | null) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString("en-IN"); } catch { return value; }
}
function formatDate(value?: string | null) {
  if (!value) return "—";
  try { return new Date(value).toLocaleDateString("en-IN"); } catch { return value; }
}

function StageBadge({ stage }: { stage: LeadStage }) {
  const colors: Record<string, string> = {
    NEW: "bg-blue-100 text-blue-800",
    CONTACTED: "bg-purple-100 text-purple-800",
    INTERESTED: "bg-yellow-100 text-yellow-800",
    KYC_PENDING: "bg-orange-100 text-orange-800",
    READY_TO_CONVERT: "bg-teal-100 text-teal-800",
    CONVERTED: "bg-green-100 text-green-800",
    LOST: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${colors[stage] || "bg-gray-100 text-gray-600"}`}>
      {LEAD_STAGE_LABELS[stage] || stage}
    </span>
  );
}

function TaskRow({ task, onComplete, onCancel }: {
  task: FollowUpTask;
  onComplete: (id: number) => Promise<void>;
  onCancel: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const overdue = task.is_overdue;

  return (
    <tr className="border-t border-border/60">
      <td className="px-4 py-3 text-sm">
        <div className={`font-medium ${overdue ? "text-orange-700" : "text-foreground"}`}>
          {formatDt(task.due_at)}
          {overdue && task.status === "OPEN" ? <span className="ml-2 text-[10px] font-bold text-orange-600 uppercase">Overdue</span> : null}
        </div>
        {task.call_note ? <div className="mt-0.5 text-xs text-muted-foreground">{task.call_note}</div> : null}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{task.assigned_to_username || "—"}</td>
      <td className="px-4 py-3 text-sm">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
          task.status === "DONE" ? "bg-green-100 text-green-700" :
          task.status === "CANCELLED" ? "bg-gray-100 text-gray-500" :
          overdue ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
        }`}>{task.status}</span>
      </td>
      <td className="px-4 py-3">
        {task.status === "OPEN" ? (
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={async () => { setBusy(true); try { await onComplete(task.id); } finally { setBusy(false); } }}
              className="rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
            >
              {busy ? "…" : "Complete"}
            </button>
            <button
              disabled={busy}
              onClick={async () => { setBusy(true); try { await onCancel(task.id); } finally { setBusy(false); } }}
              className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              {busy ? "…" : "Cancel"}
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{formatDt(task.completed_at)}</span>
        )}
      </td>
    </tr>
  );
}

function OppRow({ opp, onStageChange }: {
  opp: Opportunity;
  onStageChange: (id: number, stage: "OPEN" | "WON" | "LOST") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <tr className="border-t border-border/60">
      <td className="px-4 py-3 text-sm font-medium text-foreground">{opp.title}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">₹{Number(opp.estimated_value).toLocaleString("en-IN")}</td>
      <td className="px-4 py-3 text-sm">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
          opp.stage === "WON" ? "bg-green-100 text-green-700" :
          opp.stage === "LOST" ? "bg-gray-100 text-gray-500" : "bg-blue-100 text-blue-700"
        }`}>{opp.stage}</span>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(opp.expected_close_date)}</td>
      <td className="px-4 py-3">
        {opp.stage === "OPEN" ? (
          <div className="flex gap-2">
            {(["WON", "LOST"] as const).map((s) => (
              <button
                key={s}
                disabled={busy}
                onClick={async () => { setBusy(true); try { await onStageChange(opp.id, s); } finally { setBusy(false); } }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                  s === "WON" ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100" :
                  "border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {busy ? "…" : s}
              </button>
            ))}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export default function AdminCrmLeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [detail, setDetail] = useState<InternalLeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // forms
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskDue, setTaskDue] = useState("");
  const [taskNote, setTaskNote] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);

  const [showOppForm, setShowOppForm] = useState(false);
  const [oppTitle, setOppTitle] = useState("");
  const [oppValue, setOppValue] = useState("");
  const [oppDate, setOppDate] = useState("");
  const [oppBusy, setOppBusy] = useState(false);

  const [stageBusy, setStageBusy] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInternalLeadDetail(id);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load lead detail.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const handleStageMove = async (stage: LeadStage) => {
    if (!detail) return;
    setStageBusy(true);
    try {
      const updated = await moveLeadStage(id, stage);
      setDetail((prev) => prev ? { ...prev, lead: { ...prev.lead, stage: updated.stage } } : null);
    } finally {
      setStageBusy(false);
    }
  };

  const handleConvert = async () => {
    if (!detail) return;
    if (!confirm("Convert this lead to a customer? This cannot be undone.")) return;
    setConvertBusy(true);
    try {
      const result = await convertLead(id);
      router.push(`${ROUTES.admin.customers}/${result.customer_id}`);
    } finally {
      setConvertBusy(false);
    }
  };

  const handleCompleteTask = async (taskId: number) => {
    await completeFollowUpTask(taskId);
    await load();
  };

  const handleCancelTask = async (taskId: number) => {
    await cancelFollowUpTask(taskId);
    await load();
  };

  const handleCreateTask = async () => {
    if (!taskDue) return;
    setTaskBusy(true);
    try {
      await createLeadTask(id, { due_at: new Date(taskDue).toISOString(), call_note: taskNote });
      setShowTaskForm(false);
      setTaskDue("");
      setTaskNote("");
      await load();
    } finally {
      setTaskBusy(false);
    }
  };

  const handleOppStageChange = async (oppId: number, stage: "OPEN" | "WON" | "LOST") => {
    await updateOpportunityStage(oppId, stage);
    await load();
  };

  const handleCreateOpp = async () => {
    if (!oppTitle.trim()) return;
    setOppBusy(true);
    try {
      await createOpportunity(id, {
        title: oppTitle.trim(),
        estimated_value: oppValue || "0",
        expected_close_date: oppDate || undefined,
      });
      setShowOppForm(false);
      setOppTitle("");
      setOppValue("");
      setOppDate("");
      await load();
    } finally {
      setOppBusy(false);
    }
  };

  const lead = detail?.lead;
  const currentStageIndex = lead ? LEAD_STAGES.indexOf(lead.stage) : -1;
  const nextStages = lead
    ? LEAD_STAGES.filter((s) => {
        if (lead.stage === "CONVERTED" || lead.stage === "LOST") return s === "NEW";
        return LEAD_STAGES.indexOf(s) > currentStageIndex && s !== "CONVERTED";
      })
    : [];
  const canConvert = lead?.stage === "READY_TO_CONVERT";

  return (
    <ERPPageShell
      title={lead ? lead.name : "Lead Detail"}
      subtitle={lead ? `${lead.phone} · ${lead.source ? (LEAD_SOURCE_LABELS[lead.source] || lead.source) : ""}` : ""}
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "Leads", href: ROUTES.admin.crmLeads },
        { label: lead?.name || `Lead #${id}` },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading lead…" /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load lead" description={error} /> : null}

      {!loading && !error && detail && lead ? (
        <>
          {/* Identity + Stage */}
          <ERPSectionShell title="Lead profile" description="Contact details and current pipeline stage.">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <StageBadge stage={lead.stage} />
                  <span className="text-xs text-muted-foreground">since {formatDt(lead.created_at)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Name</div><div className="font-medium">{lead.name}</div></div>
                  <div><div className="text-xs text-muted-foreground">Phone</div><div className="font-medium">{lead.phone}</div></div>
                  {lead.email ? <div><div className="text-xs text-muted-foreground">Email</div><div>{lead.email}</div></div> : null}
                  {lead.address ? <div className="col-span-2"><div className="text-xs text-muted-foreground">Address</div><div>{lead.address}</div></div> : null}
                  <div><div className="text-xs text-muted-foreground">Source</div><div>{LEAD_SOURCE_LABELS[lead.source] || lead.source || "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Plan interest</div><div>{lead.interested_plan_type?.replace("_", " ") || "—"}</div></div>
                  {lead.product_name ? <div><div className="text-xs text-muted-foreground">Product</div><div>{lead.product_name}</div></div> : null}
                  <div><div className="text-xs text-muted-foreground">Assigned to</div><div>{lead.assigned_to_full_name || lead.assigned_to_username || "Unassigned"}</div></div>
                  {lead.next_follow_up_at ? (
                    <div>
                      <div className="text-xs text-muted-foreground">Next follow-up</div>
                      <div className={new Date(lead.next_follow_up_at) <= new Date() ? "text-orange-600 font-medium" : ""}>
                        {formatDt(lead.next_follow_up_at)}
                      </div>
                    </div>
                  ) : null}
                  {lead.converted_customer ? (
                    <div>
                      <div className="text-xs text-muted-foreground">Converted customer</div>
                      <a href={`${ROUTES.admin.customers}/${lead.converted_customer}`} className="text-primary hover:underline underline-offset-4">
                        {lead.converted_customer_name || `Customer #${lead.converted_customer}`}
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Stage actions */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Move Stage</div>
                <div className="flex flex-wrap gap-2">
                  {nextStages.map((stage) => (
                    <button
                      key={stage}
                      disabled={stageBusy}
                      onClick={() => void handleStageMove(stage)}
                      className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    >
                      → {LEAD_STAGE_LABELS[stage]}
                    </button>
                  ))}
                  <button
                    disabled={stageBusy}
                    onClick={() => void handleStageMove("LOST")}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    Mark Lost
                  </button>
                </div>
                {canConvert ? (
                  <button
                    disabled={convertBusy}
                    onClick={() => void handleConvert()}
                    className="mt-3 w-full rounded-xl border border-green-300 bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {convertBusy ? "Converting…" : "Convert to Customer"}
                  </button>
                ) : null}
              </div>
            </div>
          </ERPSectionShell>

          {/* Follow-up tasks */}
          <ERPSectionShell
            title={`Follow-up Tasks (${detail.open_task_count} open${detail.overdue_task_count > 0 ? `, ${detail.overdue_task_count} overdue` : ""})`}
            description="Scheduled calls and tasks for this lead."
          >
            <div className="mb-3">
              <button
                onClick={() => setShowTaskForm((v) => !v)}
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                {showTaskForm ? "Cancel" : "+ Add Task"}
              </button>
            </div>

            {showTaskForm ? (
              <div className="mb-4 rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">Due date & time *</label>
                    <input
                      type="datetime-local"
                      value={taskDue}
                      onChange={(e) => setTaskDue(e.target.value)}
                      className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Note</label>
                    <input
                      type="text"
                      value={taskNote}
                      onChange={(e) => setTaskNote(e.target.value)}
                      placeholder="Call note…"
                      className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={!taskDue || taskBusy}
                    onClick={() => void handleCreateTask()}
                    className="rounded-xl border border-primary bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {taskBusy ? "Saving…" : "Save Task"}
                  </button>
                  <button onClick={() => setShowTaskForm(false)} className="rounded-xl border border-border px-4 py-1.5 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {detail.follow_up_tasks.length === 0 ? (
              <ERPEmptyState title="No tasks" description="Add the first follow-up task for this lead." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5">Due / Note</th>
                      <th className="px-4 py-2.5">Assigned</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.follow_up_tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onComplete={handleCompleteTask}
                        onCancel={handleCancelTask}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ERPSectionShell>

          {/* Opportunities */}
          <ERPSectionShell
            title={`Opportunities (${detail.opportunities.length})`}
            description="Deals and estimated values linked to this lead."
          >
            <div className="mb-3">
              <button
                onClick={() => setShowOppForm((v) => !v)}
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                {showOppForm ? "Cancel" : "+ Add Opportunity"}
              </button>
            </div>

            {showOppForm ? (
              <div className="mb-4 rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1">Title *</label>
                    <input
                      type="text"
                      value={oppTitle}
                      onChange={(e) => setOppTitle(e.target.value)}
                      placeholder="e.g. 3-seater sofa EMI deal"
                      className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Estimated value (₹)</label>
                    <input
                      type="number"
                      value={oppValue}
                      onChange={(e) => setOppValue(e.target.value)}
                      placeholder="0"
                      className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Expected close date</label>
                    <input
                      type="date"
                      value={oppDate}
                      onChange={(e) => setOppDate(e.target.value)}
                      className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={!oppTitle.trim() || oppBusy}
                    onClick={() => void handleCreateOpp()}
                    className="rounded-xl border border-primary bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {oppBusy ? "Saving…" : "Save Opportunity"}
                  </button>
                  <button onClick={() => setShowOppForm(false)} className="rounded-xl border border-border px-4 py-1.5 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {detail.opportunities.length === 0 ? (
              <ERPEmptyState title="No opportunities" description="Track deal values by adding an opportunity." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5">Title</th>
                      <th className="px-4 py-2.5">Value</th>
                      <th className="px-4 py-2.5">Stage</th>
                      <th className="px-4 py-2.5">Close Date</th>
                      <th className="px-4 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.opportunities.map((opp) => (
                      <OppRow key={opp.id} opp={opp} onStageChange={handleOppStageChange} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ERPSectionShell>
        </>
      ) : null}
    </ERPPageShell>
  );
}
