"use client";

import { useState, useEffect, useCallback } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  listDisputes,
  createDispute,
  updateDispute,
  notifyCustomerDispute,
  CustomerDispute,
  DISPUTE_TYPES,
  DISPUTE_STAGES,
  DisputeStage,
} from "@/services/disputes";
import {
  getDisputeSLAStatus,
  getBreachedSLADisputes,
  getPendingEscalationDisputes,
  moveDisputeToReview,
  escalateDispute,
  formatSLAStatus,
  DisputeSLAStatus,
} from "@/services/dispute-sla";

const STAGE_COLORS: Record<string, string> = {
  OPEN: "bg-yellow-50 text-yellow-700 border-yellow-200",
  UNDER_REVIEW: "bg-blue-50 text-blue-700 border-blue-200",
  RESOLVED: "bg-green-50 text-green-700 border-green-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  ESCALATED: "bg-orange-50 text-orange-700 border-orange-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-muted-foreground",
  MEDIUM: "text-amber-600 font-medium",
  HIGH: "text-red-600 font-semibold",
};

const STAGE_TRANSITIONS: Record<string, DisputeStage[]> = {
  OPEN: ["UNDER_REVIEW", "ESCALATED", "REJECTED"],
  UNDER_REVIEW: ["RESOLVED", "REJECTED", "ESCALATED"],
  ESCALATED: ["UNDER_REVIEW", "RESOLVED", "REJECTED"],
};

export default function DisputesPage() {
  const [rows, setRows] = useState<CustomerDispute[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterStage, setFilterStage] = useState("");
  const [filterType, setFilterType] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    subscription_id: "",
    dispute_type: "OTHER" as string,
    subject: "",
    description: "",
    priority: "MEDIUM",
  });
  const [formBusy, setFormBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<CustomerDispute | null>(null);
  const [selectedSLA, setSelectedSLA] = useState<DisputeSLAStatus | null>(null);
  const [patchStage, setPatchStage] = useState<DisputeStage | "">("");
  const [patchNotes, setPatchNotes] = useState("");
  const [patchBusy, setPatchBusy] = useState(false);
  const [patchMsg, setPatchMsg] = useState<string | null>(null);

  const [notifyMsg, setNotifyMsg] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);

  const [slaAction, setSLAAction] = useState<"move-review" | "escalate" | null>(null);
  const [slaActionBusy, setSLAActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listDisputes({ stage: filterStage, dispute_type: filterType });
      setRows(res.results);
      setCount(res.count);
    } catch {
      setError("Failed to load disputes.");
    } finally {
      setLoading(false);
    }
  }, [filterStage, filterType]);

  useEffect(() => { void load(); }, [load]);

  const submitCreate = async () => {
    if (!form.customer_id || !form.subject || !form.description) {
      setFormErr("Customer ID, subject, and description are required.");
      return;
    }
    setFormBusy(true);
    setFormErr(null);
    try {
      await createDispute({
        customer_id: Number(form.customer_id),
        subscription_id: form.subscription_id ? Number(form.subscription_id) : null,
        dispute_type: form.dispute_type as never,
        subject: form.subject,
        description: form.description,
        priority: form.priority as never,
      });
      setShowCreate(false);
      setForm({ customer_id: "", subscription_id: "", dispute_type: "OTHER", subject: "", description: "", priority: "MEDIUM" });
      void load();
    } catch {
      setFormErr("Failed to create dispute.");
    } finally {
      setFormBusy(false);
    }
  };

  const submitPatch = async () => {
    if (!selected) return;
    setPatchBusy(true);
    setPatchMsg(null);
    try {
      const payload: Record<string, unknown> = {};
      if (patchStage) payload.stage = patchStage;
      if (patchNotes) payload.resolution_notes = patchNotes;
      const updated = await updateDispute(selected.id, payload);
      setSelected(updated);
      setPatchMsg("Updated.");
      void load();
    } catch {
      setPatchMsg("Update failed.");
    } finally {
      setPatchBusy(false);
    }
  };

  const submitNotify = async () => {
    if (!selected || !notifyMsg.trim()) return;
    setNotifyBusy(true);
    setNotifyResult(null);
    try {
      const res = await notifyCustomerDispute(selected.id, notifyMsg);
      setNotifyResult(`Email sent to ${res.email}`);
      setNotifyMsg("");
    } catch {
      setNotifyResult("Failed to send email.");
    } finally {
      setNotifyBusy(false);
    }
  };

  const handleManageDispute = async (dispute: CustomerDispute) => {
    setSelected(dispute);
    setPatchStage("");
    setPatchNotes(dispute.resolution_notes || "");
    setPatchMsg(null);
    setNotifyResult(null);
    setNotifyMsg("");
    setSLAAction(null);
    setSLAActionBusy(false);

    // Load SLA status
    try {
      const sla = await getDisputeSLAStatus(dispute.id);
      setSelectedSLA(sla);
    } catch (err) {
      console.error("Failed to load SLA status:", err);
    }
  };

  const handleSLAAction = async (action: "move-review" | "escalate") => {
    if (!selected) return;
    setSLAActionBusy(true);
    try {
      if (action === "move-review") {
        await moveDisputeToReview(selected.id);
        setPatchMsg("Moved to review.");
      } else if (action === "escalate") {
        await escalateDispute(selected.id);
        setPatchMsg("Escalated.");
      }
      void load();
      setTimeout(() => handleManageDispute(selected), 500);
    } catch (err) {
      setPatchMsg("Action failed.");
      console.error(err);
    } finally {
      setSLAActionBusy(false);
    }
  };

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Customer Disputes"
      subtitle="Raise, review, resolve, and escalate customer dispute records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "Customer Disputes" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Total Disputes", value: loading ? "—" : count, tone: "info" },
        { label: "Open", value: loading ? "—" : rows.filter(r => String(r.stage).toUpperCase() === "OPEN").length, tone: !loading && rows.filter(r => String(r.stage).toUpperCase() === "OPEN").length > 0 ? "warning" : "success" },
        { label: "Escalated", value: loading ? "—" : rows.filter(r => String(r.stage).toUpperCase() === "ESCALATED").length, tone: !loading && rows.filter(r => String(r.stage).toUpperCase() === "ESCALATED").length > 0 ? "danger" : "success" },
        { label: "Resolved", value: loading ? "—" : rows.filter(r => String(r.stage).toUpperCase() === "RESOLVED").length, tone: "success" },
      ]}
    >
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowCreate(true)}
          className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          + New Dispute
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">All Stages</option>
          {DISPUTE_STAGES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">All Types</option>
          {DISPUTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={() => void load()} className="h-9 px-4 rounded-xl border border-border text-sm">Refresh</button>
      </div>

      <div className="text-xs text-muted-foreground mb-3">{count} dispute(s)</div>

      {loading && <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>}
      {error && <div className="text-sm text-red-600 py-4">{error}</div>}

      {!loading && rows.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-12">No disputes found.</div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Ref</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Subject</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Stage</th>
                <th className="px-4 py-3 text-left">SLA Status</th>
                <th className="px-4 py-3 text-left">Age (days)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const slaStatus = (r as any).is_sla_breached ? "breached" : (r as any).is_sla_compliant ? "compliant" : "at-risk";
                const daysOld = (r as any).days_since_creation || Math.floor((Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24));
                const slaColors = {
                  breached: "bg-red-100 text-red-700",
                  "at-risk": "bg-yellow-100 text-yellow-700",
                  compliant: "bg-green-100 text-green-700",
                };
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{r.dispute_ref}</td>
                    <td className="px-4 py-3">{r.customer_name}</td>
                    <td className="px-4 py-3 text-xs">{r.dispute_type.replace("_", " ")}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{r.subject}</td>
                    <td className={`px-4 py-3 text-xs ${PRIORITY_COLORS[r.priority] || ""}`}>{r.priority}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full border text-xs ${STAGE_COLORS[r.stage] || ""}`}>
                        {r.stage.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${slaColors[slaStatus as keyof typeof slaColors] || ""}`}>
                        {slaStatus === "breached" ? "⚠️ Breached" : slaStatus === "at-risk" ? "⏱️ At Risk" : "✓ On Track"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{daysOld} days</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void handleManageDispute(r)}
                        className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dispute Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-lg font-bold mb-4">New Dispute</h2>
            {formErr && <div className="text-sm text-red-600 mb-3">{formErr}</div>}
            <div className="space-y-3">
              <input placeholder="Customer ID *" value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm" />
              <input placeholder="Subscription ID (optional)" value={form.subscription_id} onChange={e => setForm(p => ({ ...p, subscription_id: e.target.value }))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm" />
              <select value={form.dispute_type} onChange={e => setForm(p => ({ ...p, dispute_type: e.target.value }))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm">
                {DISPUTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm">
                <option value="LOW">Low Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="HIGH">High Priority</option>
              </select>
              <input placeholder="Subject *" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm" />
              <textarea placeholder="Description *" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => void submitCreate()} disabled={formBusy} className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                {formBusy ? "Creating…" : "Create Dispute"}
              </button>
              <button onClick={() => setShowCreate(false)} className="h-9 px-4 rounded-xl border border-border text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Dispute Panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
          <div className="bg-card rounded-t-2xl sm:rounded-xl border border-border p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs text-muted-foreground font-mono">{selected.dispute_ref}</div>
                <h2 className="text-lg font-bold">{selected.subject}</h2>
                <div className="text-sm text-muted-foreground mt-1">{selected.customer_name}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground text-lg">×</button>
            </div>

            <div className="text-sm text-foreground mb-4 bg-muted/30 rounded-xl p-3">{selected.description}</div>

            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full border text-xs ${STAGE_COLORS[selected.stage] || ""}`}>
                {selected.stage.replace("_", " ")}
              </span>
              <span className={`text-xs ${PRIORITY_COLORS[selected.priority] || ""}`}>{selected.priority}</span>
              {selectedSLA && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selectedSLA.is_sla_breached ? "bg-red-100 text-red-700" : selectedSLA.is_sla_compliant ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {selectedSLA.is_sla_breached ? "⚠️ SLA Breached" : selectedSLA.is_sla_compliant ? "✓ On Track" : "⏱️ At Risk"}
                </span>
              )}
            </div>

            {/* SLA Timeline */}
            {selectedSLA && (
              <div className="bg-muted/40 rounded-xl p-3 mb-4 text-xs">
                <div className="font-semibold mb-2">SLA Timeline</div>
                <div className="space-y-1 text-muted-foreground">
                  <div>Created: {new Date(selected.created_at).toLocaleDateString()}</div>
                  <div>Age: {selectedSLA.days_since_creation} days</div>
                  {selectedSLA.stage === "OPEN" && selectedSLA.open_due_at && (
                    <div>Due: {new Date(selectedSLA.open_due_at).toLocaleDateString()} (7 days)</div>
                  )}
                  {selectedSLA.stage === "UNDER_REVIEW" && selectedSLA.review_due_at && (
                    <div>Due: {new Date(selectedSLA.review_due_at).toLocaleDateString()} (14 days)</div>
                  )}
                </div>
              </div>
            )}

            {/* Stage transition */}
            {STAGE_TRANSITIONS[selected.stage] && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Advance Stage</div>
                <div className="flex gap-2 flex-wrap">
                  {(STAGE_TRANSITIONS[selected.stage] || []).map(s => (
                    <button
                      key={s}
                      onClick={() => setPatchStage(s)}
                      className={`h-8 px-3 rounded-xl border text-xs font-medium ${patchStage === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                    >
                      {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Resolution notes */}
            <div className="mb-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Resolution Notes</div>
              <textarea value={patchNotes} onChange={e => setPatchNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none" placeholder="Add resolution details…" />
            </div>

            {patchMsg && <div className="text-xs text-green-700 mb-2">{patchMsg}</div>}

            <button onClick={() => void submitPatch()} disabled={patchBusy || (!patchStage && !patchNotes)} className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold mb-4 disabled:opacity-50">
              {patchBusy ? "Saving…" : "Save Changes"}
            </button>

            {/* SLA Actions */}
            {selectedSLA && selected.stage === "OPEN" && (
              <div className="border-t border-border pt-4 pb-4 mb-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">SLA Actions</div>
                <button
                  onClick={() => void handleSLAAction("move-review")}
                  disabled={slaActionBusy}
                  className="w-full h-9 rounded-xl border border-blue-300 text-blue-700 text-sm font-medium mb-2 hover:bg-blue-50 disabled:opacity-50"
                >
                  {slaActionBusy ? "Processing…" : "Move to Review"}
                </button>
              </div>
            )}

            {selectedSLA && (selectedSLA.stage === "OPEN" || selectedSLA.stage === "UNDER_REVIEW") && selectedSLA.is_sla_breached && (
              <div className="border-t border-border pt-4 pb-4 mb-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Escalation</div>
                <button
                  onClick={() => void handleSLAAction("escalate")}
                  disabled={slaActionBusy}
                  className="w-full h-9 rounded-xl border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                >
                  {slaActionBusy ? "Processing…" : "Escalate Dispute"}
                </button>
              </div>
            )}

            {/* Notify customer */}
            <div className="border-t border-border pt-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Email Customer</div>
              <textarea value={notifyMsg} onChange={e => setNotifyMsg(e.target.value)} rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none mb-2" placeholder="Write message to customer about this dispute…" />
              {notifyResult && <div className={`text-xs mb-2 ${notifyResult.includes("Failed") ? "text-red-600" : "text-green-700"}`}>{notifyResult}</div>}
              <button onClick={() => void submitNotify()} disabled={notifyBusy || !notifyMsg.trim()} className="h-9 px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50">
                {notifyBusy ? "Sending…" : "Send Email to Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ERPPageShell>
  );
}
