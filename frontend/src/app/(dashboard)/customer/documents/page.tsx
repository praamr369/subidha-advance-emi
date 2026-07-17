"use client";

import { Award, FileDown, FileText, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import CustomerPageShell, { CPageCard, CPageSection, CPageTabs } from "@/components/layout/CustomerPageShell";
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
  if (cat === "RECEIPT") return <Receipt className="h-4 w-4 text-emerald-600" />;
  if (cat === "DRAW_CERTIFICATE") return <Award className="h-4 w-4 text-amber-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function catBadgeCls(cat: string) {
  if (cat === "AGREEMENT") return "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400";
  if (cat === "RECEIPT") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400";
  if (cat === "DRAW_CERTIFICATE") return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

const TABS = [
  { value: "ALL" as ArchiveCategory, label: "All" },
  { value: "AGREEMENT" as ArchiveCategory, label: "Agreements" },
  { value: "RECEIPT" as ArchiveCategory, label: "Receipts" },
  { value: "DRAW_CERTIFICATE" as ArchiveCategory, label: "Certificates" },
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

  useEffect(() => { void load(); }, [load]);

  const visible = tab === "ALL" ? entries : entries.filter((e) => e.category === tab);

  return (
    <CustomerPageShell
      title="My Documents"
      subtitle="Download your agreements, receipts, and certificates"
      backHref="/customer"
      backLabel="Dashboard"
    >
      <CPageSection>
        <CPageTabs tabs={TABS} active={tab} onChange={setTab} />
      </CPageSection>

      {loading ? <ERPLoadingState label="Loading archive…" /> : null}
      {!loading && error ? (
        <ERPErrorState title="Unable to load documents" description={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && visible.length === 0 ? (
        <ERPEmptyState
          title="No documents yet"
          description={tab === "DRAW_CERTIFICATE" ? "Certificates appear here when you win a Lucky Draw." : "Documents will appear here once your subscription is active."}
        />
      ) : null}

      {!loading && !error && visible.length > 0 ? (
        <CPageSection title={`${visible.length} document${visible.length !== 1 ? "s" : ""}`}>
          <div className="space-y-2.5">
            {visible.map((entry) => (
              <CPageCard key={`${entry.source_type}-${entry.source_id}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{categoryIcon(entry.category)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-foreground truncate">{entry.label}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${catBadgeCls(entry.category)}`}>
                        {entry.category_label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {entry.reference || "—"}
                      {entry.version ? ` · v${entry.version}` : ""}
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
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-2.5 text-xs font-semibold text-foreground hover:bg-muted transition"
                  >
                    <FileDown className="size-3.5" />
                    {entry.download_label}
                  </a>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground text-center">File not available</p>
                )}
              </CPageCard>
            ))}
          </div>
        </CPageSection>
      ) : null}

      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        All documents are stored for a minimum of 7 years. Can&apos;t find a document? Contact our Grievance Officer and we&apos;ll retrieve it within 2 working days.
      </div>
    </CustomerPageShell>
  );
}
