"use client";

import { FileDown, FileText, Award, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { apiFetch } from "@/lib/api";

type ArchiveCategory = "ALL" | "AGREEMENT" | "RECEIPT" | "DRAW_CERTIFICATE";

type ArchiveEntry = {
  category: ArchiveCategory;
  category_label: string;
  id: number;
  label: string;
  reference: string;
  date: string | null;
  version: number | null;
  download_url: string | null;
  download_label: string;
  source_id: number;
  source_type: string;
};

async function listCustomerArchive(): Promise<{ count: number; results: ArchiveEntry[] }> {
  return apiFetch<{ count: number; results: ArchiveEntry[] }>("/customer/archive/");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function categoryIcon(cat: string) {
  if (cat === "RECEIPT") return <Receipt className="h-4 w-4 text-muted-foreground" />;
  if (cat === "DRAW_CERTIFICATE") return <Award className="h-4 w-4 text-amber-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function categoryBadge(cat: string, label: string) {
  const cls: Record<string, string> = {
    AGREEMENT: "bg-blue-50 text-blue-700 border-blue-200",
    RECEIPT: "bg-green-50 text-green-700 border-green-200",
    DRAW_CERTIFICATE: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls[cat] ?? "bg-muted text-muted-foreground border-border"}`}>
      {label}
    </span>
  );
}

const TABS: { key: ArchiveCategory; label: string }[] = [
  { key: "ALL", label: "All Documents" },
  { key: "AGREEMENT", label: "Agreements" },
  { key: "RECEIPT", label: "Receipts" },
  { key: "DRAW_CERTIFICATE", label: "Draw Certificates" },
];

export default function CustomerDocumentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [tab, setTab] = useState<ArchiveCategory>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listCustomerArchive();
      setEntries(payload.results ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = tab === "ALL" ? entries : entries.filter((e) => e.category === tab);

  const counts: Record<ArchiveCategory, number> = {
    ALL: entries.length,
    AGREEMENT: entries.filter((e) => e.category === "AGREEMENT").length,
    RECEIPT: entries.filter((e) => e.category === "RECEIPT").length,
    DRAW_CERTIFICATE: entries.filter((e) => e.category === "DRAW_CERTIFICATE").length,
  };

  return (
    <ERPPageShell
      title="My Documents & Archive"
      subtitle="Download your signed agreements, payment receipts, and Lucky Draw certificates."
      breadcrumbs={[{ label: "Dashboard", href: "/customer" }, { label: "Documents" }]}
      actions={[{ href: "/customer/account-statement", label: "Account Statement", variant: "secondary" }]}
      headerMode="erp"
    >
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b pb-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={`ml-1.5 text-xs ${tab === t.key ? "opacity-80" : "opacity-60"}`}>
                ({counts[t.key]})
              </span>
            )}
          </button>
        ))}
      </div>

      <ERPSectionShell
        title={TABS.find((t) => t.key === tab)?.label ?? "Documents"}
        description={
          tab === "AGREEMENT"
            ? "Your signed subscription and EMI contracts."
            : tab === "RECEIPT"
            ? "Payment receipts for every EMI and advance payment."
            : tab === "DRAW_CERTIFICATE"
            ? "Lucky Draw winner certificates issued to you."
            : "All signed documents, receipts, and certificates in one place."
        }
      >
        {loading ? <ERPLoadingState label="Loading archive…" /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load documents" message={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !error && visible.length === 0 ? (
          <ERPEmptyState
            title="No documents yet"
            description={
              tab === "DRAW_CERTIFICATE"
                ? "Certificates appear here when you win a Lucky Draw."
                : "Documents will appear here once your subscription is active."
            }
          />
        ) : null}

        {!loading && !error && visible.length > 0 ? (
          <div className="divide-y">
            {visible.map((entry) => (
              <div key={`${entry.source_type}-${entry.source_id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 px-1">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0">{categoryIcon(entry.category)}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium">{entry.label}</span>
                      {categoryBadge(entry.category, entry.category_label)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Ref: {entry.reference || "—"}
                      {entry.version ? ` · Version ${entry.version}` : ""}
                      {" · "}
                      {formatDate(entry.date)}
                    </div>
                  </div>
                </div>

                {entry.download_url ? (
                  <a
                    href={entry.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    {entry.download_label}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">File not available</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </ERPSectionShell>

      {/* Info note */}
      <div className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <strong>Archive policy:</strong> All documents are stored for a minimum of 7 years. If you cannot find a document, contact our Grievance Officer — we will retrieve and deliver your copy within 2 working days.
      </div>
    </ERPPageShell>
  );
}
