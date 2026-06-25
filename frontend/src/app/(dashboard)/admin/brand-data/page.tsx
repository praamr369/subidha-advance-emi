"use client";

import { useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  applyApprovedBrandItems,
  getBrandDataAudit,
  listBrandSources,
  previewGoogleBusinessImport,
  previewManualBrandImport,
  previewYoutubeImport,
  reviewImportedItem,
  type BrandImportItem,
} from "@/services/brand-data";

const OP_LABELS = ["Advance EMI", "Rent", "Lease", "Direct Sale"] as const;

export default function AdminBrandDataPage() {
  const [manualJson, setManualJson] = useState("");
  const [items, setItems] = useState<BrandImportItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [auditRows, setAuditRows] = useState<Array<Record<string, unknown>>>([]);
  const [sources, setSources] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sections = useMemo(
    () => [
      "Brand identity",
      "Contact & location",
      "Business operations",
      "Social links",
      "Media assets",
      "Public website content",
      "Import preview",
      "Approval queue",
      "Audit history",
    ],
    []
  );

  async function loadProviderStatus() {
    setLoading(true);
    setError(null);
    try {
      const [sourcePayload, auditPayload] = await Promise.all([listBrandSources(), getBrandDataAudit()]);
      setSources(sourcePayload.results);
      setAuditRows(auditPayload.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load provider status");
    } finally {
      setLoading(false);
    }
  }

  async function runManualPreview() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = manualJson.trim() ? JSON.parse(manualJson) : {};
      const result = await previewManualBrandImport(payload);
      setItems(result.items || []);
      setSelectedIds([]);
      setSuccess(`Preview created with ${result.item_count} candidate items.`);
      const auditPayload = await getBrandDataAudit();
      setAuditRows(auditPayload.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run manual preview");
    } finally {
      setLoading(false);
    }
  }

  async function providerStub(handler: () => Promise<Record<string, unknown>>) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = await handler();
      setSuccess(String(payload.detail || "Provider status checked."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provider preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function mark(item_id: number, action: "approve" | "reject") {
    await reviewImportedItem(item_id, action);
    setItems((prev) => prev.map((item) => (item.id === item_id ? { ...item, approval_status: action === "approve" ? "APPROVED" : "REJECTED" } : item)));
  }

  async function applySelected() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await applyApprovedBrandItems(selectedIds);
      setSuccess("Approved brand items applied to public profile safely.");
      const auditPayload = await getBrandDataAudit();
      setAuditRows(auditPayload.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Settings"
      title="Brand & Business Data Center"
      subtitle="Manage Subidha Furniture profile, public content, social links, media, and verified business details."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Brand Data" },
      ]}
      actions={[{ label: "Load Provider Status", href: ROUTES.admin.brandData }]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-6">
        <section className="rounded border p-4">
          <h3 className="text-sm font-semibold">Business operations</h3>
          <p className="mt-1 text-sm text-muted-foreground">{OP_LABELS.join(" • ")}</p>
        </section>

        <section className="grid gap-2 md:grid-cols-3">
          {sections.map((label) => (
            <div key={label} className="rounded border bg-card px-3 py-2 text-sm">
              {label}
            </div>
          ))}
        </section>

        <section className="rounded border p-4">
          <h3 className="text-sm font-semibold">Provider connection status</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded border px-3 py-1 text-sm" onClick={() => void providerStub(previewGoogleBusinessImport)} type="button">
              Google Business Profile
            </button>
            <button className="rounded border px-3 py-1 text-sm" onClick={() => void providerStub(previewYoutubeImport)} type="button">
              YouTube
            </button>
            <button className="rounded border px-3 py-1 text-sm" onClick={() => void loadProviderStatus()} type="button">
              Facebook / Justdial status
            </button>
          </div>
          {sources.length > 0 ? (
            <div className="mt-3 text-sm text-muted-foreground">
              {sources.map((s) => `${String(s.name)}: ${String(s.status_label || "Not configured")}`).join(" | ")}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Not configured</p>
          )}
        </section>

        <section className="rounded border p-4">
          <h3 className="text-sm font-semibold">Manual import form</h3>
          <textarea
            className="mt-2 min-h-44 w-full rounded border p-2 font-mono text-xs"
            placeholder='Paste structured JSON with fields like "brand_name", "phone", "facebook_url", "storefront_image_urls".'
            value={manualJson}
            onChange={(event) => setManualJson(event.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button className="rounded border px-3 py-1 text-sm" onClick={() => void runManualPreview()} type="button">
              Create Import Preview
            </button>
            <button className="rounded border px-3 py-1 text-sm" onClick={() => void applySelected()} type="button" disabled={selectedIds.length === 0}>
              Apply Approved Items
            </button>
          </div>
        </section>

        {loading ? <LoadingBlock label="Loading brand-data workflow..." /> : null}
        {error ? <ErrorState title="Brand-data operation failed" description={error} /> : null}
        {success ? <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</div> : null}

        <section className="rounded border p-4">
          <h3 className="text-sm font-semibold">Approval queue</h3>
          {items.length === 0 ? (
            <EmptyState title="No preview items yet" description="Run a manual preview to generate candidate fields for approval." />
          ) : (
            <div className="mt-2 space-y-2">
              {items.map((item) => (
                <label key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span>
                    {item.field_key} ({item.item_type}) - {item.approval_status}
                  </span>
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={(event) =>
                        setSelectedIds((prev) =>
                          event.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)
                        )
                      }
                    />
                    <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => void mark(item.id, "approve")}>
                      Approve
                    </button>
                    <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => void mark(item.id, "reject")}>
                      Reject
                    </button>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="rounded border p-4">
          <h3 className="text-sm font-semibold">Audit history</h3>
          {auditRows.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No brand-data audit events yet.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {auditRows.map((row) => (
                <li key={String(row.id)} className="rounded border px-3 py-2">
                  {String(row.event || "EVENT")} · {String(row.created_at || "")}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ERPPageShell>
  );
}
