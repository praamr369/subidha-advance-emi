"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import AiSafetyBanner from "@/components/admin/ai/AiSafetyBanner";
import AiSourceTable from "@/components/admin/ai/AiSourceTable";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import Card from "@/components/ui/card";
import DrawerShell from "@/components/ui/DrawerShell";
import FormField from "@/components/ui/FormField";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  createSource,
  getSources,
  ingestSource,
  isAiDisabledError,
  type AiKnowledgeSource,
} from "@/services/admin-ai";

const SOURCE_TYPES = [
  "INTERNAL_RUNBOOK",
  "POLICY",
  "FAQ",
  "SYSTEM_HELP",
  "PUBLIC_PAGE",
];

const BLOCKED_CONTENT_PATTERNS = [
  "SECRET_KEY=",
  "JWT_SIGNING_KEY=",
  "DATABASE_URL=",
  "API_KEY=",
  "BEGIN PRIVATE KEY",
];

function contentLooksUnsafe(value: string): boolean {
  const upper = value.toUpperCase();
  return BLOCKED_CONTENT_PATTERNS.some((pattern) => upper.includes(pattern));
}

export default function AdminAiSourcesPage() {
  const [sources, setSources] = useState<AiKnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState(SOURCE_TYPES[0]);
  const [contentText, setContentText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ingestingId, setIngestingId] = useState<number | null>(null);

  const loadSources = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getSources();
      setSources(rows);
      setDisabled(false);
    } catch (err) {
      if (isAiDisabledError(err)) {
        setDisabled(true);
        setSources([]);
      } else {
        setError(err instanceof Error ? err.message : "AI sources could not be loaded.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  const resetForm = () => {
    setTitle("");
    setSourceType(SOURCE_TYPES[0]);
    setContentText("");
    setFormError(null);
  };

  const submitSource = async () => {
    const trimmedTitle = title.trim();
    const trimmedContent = contentText.trim();
    if (!trimmedTitle || !trimmedContent) {
      setFormError("Title and markdown/text content are required.");
      return;
    }
    if (contentLooksUnsafe(trimmedContent)) {
      setFormError("Content contains a blocked secret pattern and cannot be submitted.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await createSource({
        title: trimmedTitle,
        sourceType,
        contentText: trimmedContent,
      });
      resetForm();
      setDrawerOpen(false);
      await loadSources();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Source could not be created.");
    } finally {
      setSaving(false);
    }
  };

  const runIngestion = async (source: AiKnowledgeSource) => {
    setIngestingId(source.id);
    setError(null);
    try {
      await ingestSource(source.id);
      await loadSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Source ingestion failed.");
    } finally {
      setIngestingId(null);
    }
  };

  return (
    <ERPPageShell
      eyebrow="AI Assistant"
      title="AI Sources"
      subtitle="Approved internal documents for read-only assistant retrieval."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "AI Assistant", href: ROUTES.admin.aiAssistant },
        { label: "Sources" },
      ]}
      actions={[
        { href: ROUTES.admin.aiAssistant, label: "Assistant", variant: "secondary" },
        { href: ROUTES.admin.aiQueryLog, label: "Query Log", variant: "secondary" },
        { href: ROUTES.admin.aiReadiness, label: "AI Readiness", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "warning" }}
      maxWidth="1180px"
    >
      <div className="flex flex-col gap-5">
        <AiSafetyBanner disabled={disabled} />
        {error ? <ErrorState title="AI source manager unavailable" description={error} onRetry={() => void loadSources()} /> : null}
        <Card variant="bordered">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Source manager</h2>
              <p className="mt-1 text-sm text-muted-foreground">Only markdown or text content should be added in this phase.</p>
            </div>
            <ActionButton
              variant="primary"
              disabled={disabled}
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setDrawerOpen(true)}
            >
              Create source
            </ActionButton>
          </div>
        </Card>

        {loading ? <LoadingBlock label="Loading AI sources..." /> : null}
        {!loading && !disabled && sources.length === 0 ? (
          <EmptyState title="No AI sources" description="Create an approved source before using the assistant." />
        ) : null}
        {!loading && !disabled && sources.length > 0 ? (
          <AiSourceTable sources={sources} ingestingId={ingestingId} onIngest={runIngestion} />
        ) : null}
      </div>

      <DrawerShell
        open={drawerOpen}
        title="Create AI source"
        description="Add approved text or markdown content for admin-only retrieval."
        onClose={() => {
          if (!saving) {
            setDrawerOpen(false);
            resetForm();
          }
        }}
        disableClose={saving}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setDrawerOpen(false);
                resetForm();
              }}
            >
              Cancel
            </ActionButton>
            <ActionButton variant="primary" loading={saving} onClick={() => void submitSource()}>
              Create source
            </ActionButton>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {formError ? <ErrorState title="Source rejected" description={formError} /> : null}
          <FormField label="Title" htmlFor="ai-source-title" required>
            <input
              id="ai-source-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 w-full rounded-xl bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Backup Restore Runbook"
            />
          </FormField>
          <FormField label="Source type" htmlFor="ai-source-type" required>
            <select
              id="ai-source-type"
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value)}
              className="h-11 w-full rounded-xl bg-transparent px-3 text-sm outline-none"
            >
              {SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Markdown / text content"
            htmlFor="ai-source-content"
            required
            helpText="File upload, bulk import, customer exports, payment ledgers, and secrets are not accepted here."
          >
            <textarea
              id="ai-source-content"
              value={contentText}
              onChange={(event) => setContentText(event.target.value)}
              className="min-h-72 w-full resize-y rounded-xl bg-transparent px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground"
              placeholder="# Restore procedure"
            />
          </FormField>
        </div>
      </DrawerShell>
    </ERPPageShell>
  );
}
