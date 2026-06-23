"use client";

import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import type { NotificationTemplate, TemplatePreview } from "@/services/reminders";
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  listNotificationTemplates,
  previewNotificationTemplate,
  updateNotificationTemplate,
} from "@/services/reminders";

const CHANNEL_OPTIONS = [
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "CALL", label: "Call" },
  { value: "INTERNAL", label: "Internal" },
];

const CHANNEL_BADGE: Record<string, string> = {
  EMAIL: "bg-indigo-50 text-indigo-700 border-indigo-200",
  WHATSAPP: "bg-green-50 text-green-700 border-green-200",
  SMS: "bg-orange-50 text-orange-700 border-orange-200",
  CALL: "bg-purple-50 text-purple-700 border-purple-200",
  INTERNAL: "bg-gray-50 text-gray-600 border-gray-200",
};

type FormState = {
  key: string;
  name: string;
  channel: string;
  subject: string;
  body: string;
  is_active: boolean;
  description: string;
};

const EMPTY_FORM: FormState = {
  key: "",
  name: "",
  channel: "EMAIL",
  subject: "",
  body: "",
  is_active: true,
  description: "",
};

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [formMode, setFormMode] = useState<"closed" | "create" | "edit">("closed");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listNotificationTemplates();
      setTemplates(data.results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setFormMode("create");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setPreview(null);
  }

  function openEdit(t: NotificationTemplate) {
    setFormMode("edit");
    setEditingId(t.id);
    setForm({
      key: t.key,
      name: t.name,
      channel: t.channel,
      subject: t.subject,
      body: t.body,
      is_active: t.is_active,
      description: t.description,
    });
    setFormError(null);
    setPreview(null);
  }

  function closeForm() {
    setFormMode("closed");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setPreview(null);
  }

  async function handleSave() {
    setFormBusy(true);
    setFormError(null);
    try {
      if (formMode === "create") {
        await createNotificationTemplate(form);
        setNotice("Template created.");
      } else if (editingId != null) {
        await updateNotificationTemplate(editingId, form);
        setNotice("Template updated.");
      }
      closeForm();
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this template permanently?")) return;
    try {
      await deleteNotificationTemplate(id);
      setNotice("Template deleted.");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  async function handlePreview(id: number) {
    setPreviewLoading(true);
    try {
      const data = await previewNotificationTemplate(id);
      setPreview(data);
    } catch (e: unknown) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setPreviewLoading(false);
    }
  }

  const inputClass = "w-full h-9 rounded-xl border border-border bg-background px-3 text-sm";

  return (
    <ERPPageShell
      title="Notification Templates"
      subtitle="Manage reusable message templates for email, WhatsApp, and other reminder channels"
      breadcrumbs={[
        { href: ROUTES.admin.dashboard, label: "Admin" },
        { href: ROUTES.admin.reminders, label: "Reminders" },
        { label: "Templates" },
      ]}
    >
      <div className="space-y-6">
        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        <ERPSectionShell title="Templates" description="Create and edit notification message templates. Use {name}, {amount}, {due_date}, {ref}, {company} as placeholders.">
          <div className="mb-4">
            {formMode === "closed" ? (
              <button
                onClick={openCreate}
                className="h-9 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                + New Template
              </button>
            ) : null}
          </div>

          {formMode !== "closed" && (
            <div className="mb-6 rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4 space-y-3">
              <div className="font-semibold text-sm">
                {formMode === "create" ? "New Template" : "Edit Template"}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Template Key *</label>
                  <input
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. EMI_DUE"
                    disabled={formMode === "edit"}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Display Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. EMI Due Reminder"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Channel *</label>
                  <select
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value })}
                    className={inputClass}
                  >
                    {CHANNEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Active</label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    Template is active
                  </label>
                </div>
              </div>
              {(form.channel === "EMAIL") && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Email Subject</label>
                  <input
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className={inputClass}
                    placeholder="[SUBIDHA] {name} — Payment Reminder"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Message Body *</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={5}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
                  placeholder="Dear {name}, your payment of ₹{amount} is due on {due_date}..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Description (internal notes)</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={inputClass}
                  placeholder="When/how this template is used"
                />
              </div>

              {formError && (
                <div className="text-sm text-red-600 rounded-xl border border-red-200 bg-red-50 px-3 py-2">{formError}</div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={closeForm}
                  className="h-9 rounded-xl border border-border bg-background px-4 text-sm hover:bg-muted"
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={formBusy || !form.key.trim() || !form.name.trim() || !form.body.trim()}
                  className="h-9 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {formBusy ? "Saving…" : formMode === "create" ? "Create Template" : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {loading && <ERPLoadingState label="Loading templates…" />}
          {!loading && error && <ERPErrorState title="Error" description={error} />}
          {!loading && !error && templates.length === 0 && (
            <ERPEmptyState
              title="No templates yet"
              description="Create your first notification template to standardize reminder messages."
            />
          )}

          {!loading && !error && templates.length > 0 && (
            <div className="space-y-3">
              {templates.map((t) => (
                <div key={t.id} className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${CHANNEL_BADGE[t.channel] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          {t.channel}
                        </span>
                        <span className="font-mono text-xs bg-[var(--surface-muted)] px-2 py-0.5 rounded-lg">{t.key}</span>
                        <span className="font-medium text-sm">{t.name}</span>
                        {!t.is_active && (
                          <span className="rounded-full bg-gray-200 text-gray-500 px-2 py-0.5 text-xs">Inactive</span>
                        )}
                      </div>
                      {t.subject && (
                        <div className="text-xs text-muted-foreground mb-0.5">
                          Subject: <span className="font-medium">{t.subject}</span>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground line-clamp-2">{t.body}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground mt-1 italic">{t.description}</div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => void handlePreview(t.id)}
                        className="h-8 rounded-lg border border-border bg-background px-3 text-xs hover:bg-muted"
                        disabled={previewLoading}
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => openEdit(t)}
                        className="h-8 rounded-lg border border-border bg-background px-3 text-xs hover:bg-muted"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(t.id)}
                        className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs text-red-700 hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {preview && preview.template_id === t.id && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <div className="text-xs font-semibold text-blue-800 mb-2">Preview (with sample data)</div>
                      {preview.subject && (
                        <div className="text-sm mb-1">
                          <span className="font-medium">Subject:</span> {preview.subject}
                        </div>
                      )}
                      <div className="text-sm whitespace-pre-wrap bg-white rounded-lg p-2 border border-blue-100">
                        {preview.body}
                      </div>
                      <div className="mt-2 text-xs text-blue-600">
                        Placeholders: {Object.entries(preview.placeholders_used).map(([k, v]) => `{${k}}=${v}`).join(", ")}
                      </div>
                      <button
                        onClick={() => setPreview(null)}
                        className="mt-2 text-xs text-blue-700 underline"
                      >
                        Close preview
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ERPSectionShell>

        <ERPSectionShell title="Placeholder reference" description="Available placeholders for template messages">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2">
              <code className="text-xs font-mono">{"{name}"}</code>
              <div className="text-xs text-muted-foreground mt-0.5">Customer name</div>
            </div>
            <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2">
              <code className="text-xs font-mono">{"{amount}"}</code>
              <div className="text-xs text-muted-foreground mt-0.5">Due amount</div>
            </div>
            <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2">
              <code className="text-xs font-mono">{"{due_date}"}</code>
              <div className="text-xs text-muted-foreground mt-0.5">Payment due date</div>
            </div>
            <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2">
              <code className="text-xs font-mono">{"{ref}"}</code>
              <div className="text-xs text-muted-foreground mt-0.5">Subscription/contract ref</div>
            </div>
            <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2">
              <code className="text-xs font-mono">{"{company}"}</code>
              <div className="text-xs text-muted-foreground mt-0.5">Company name</div>
            </div>
          </div>
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
