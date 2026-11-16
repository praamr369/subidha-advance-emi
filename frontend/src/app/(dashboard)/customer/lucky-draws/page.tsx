"use client";
import { Download, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ERPAuditNote,
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import {
  listCustomerLuckyDraws,
  downloadCustomerLuckyDrawCertificate,
  type CustomerLuckyDraw,
  type CustomerLuckyDrawsResponse,
} from "@/services/customer";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRupee(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "₹0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load promotional benefits.";
}

function drawStatus(record: CustomerLuckyDraw): string {
  if (record.status === "COMPLETED" && record.winner_status === "VERIFIED") {
    return "WON";
  }
  return record.status || "PENDING";
}

export default function CustomerLuckyDrawsPage() {
  const [rows, setRows] = useState<CustomerLuckyDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response: CustomerLuckyDrawsResponse = await listCustomerLuckyDraws();
      setRows(response.results || []);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDownloadCertificate = useCallback(
    async (drawId: number) => {
      setDownloadingId(drawId);
      setDownloadError(null);
      try {
        await downloadCustomerLuckyDrawCertificate(drawId);
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Failed to download certificate");
      } finally {
        setDownloadingId(null);
      }
    },
    []
  );

  const stats = useMemo(() => {
    const totalParticipations = rows.length;
    const totalWins = rows.filter(
      (r) => r.status === "COMPLETED" && r.winner_status === "VERIFIED"
    ).length;
    const totalWaived = rows.reduce(
      (sum, r) => sum + (typeof r.waived_amount === "string" ? parseFloat(r.waived_amount) : 0),
      0
    );

    return {
      totalParticipations,
      totalWins,
      totalWaived,
    };
  }, [rows]);

  const drawsColumns: Column<CustomerLuckyDraw>[] = [
    {
      key: "batch_code",
      title: "Batch / Month",
      render: (row) => row.batch_code || `Batch ${row.batch}`,
    },
    {
      key: "lucky_number",
      title: "SFEMI ID",
      render: (row) => row.lucky_number || "—",
    },
    {
      key: "draw_date",
      title: "Benefit Date",
      render: (row) => formatDate(row.draw_date),
    },
    {
      key: "status",
      title: "Status",
      render: (row) => <ERPStatusBadge status={drawStatus(row)} />,
    },
    {
      key: "waived_emi_count",
      title: "EMIs Waived",
      render: (row) => row.waived_emi_count || 0,
    },
    {
      key: "waived_amount",
      title: "Waiver Amount",
      render: (row) => formatRupee(row.waived_amount),
    },
    {
      key: "actions",
      title: "Action",
      render: (row) => {
        const isWon =
          row.status === "COMPLETED" && row.winner_status === "VERIFIED";
        return isWon ? (
          <button
            onClick={() => handleDownloadCertificate(row.id)}
            disabled={downloadingId === row.id}
            className="inline-flex items-center gap-2 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download certificate"
          >
            <Download className="h-4 w-4" />
            {downloadingId === row.id ? "Downloading..." : "Certificate"}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
  ];

  return (
    <ERPPageShell title="SFEMI Promotional Benefits">
      <div className="space-y-6">
        {/* Lucky Draw Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ERPSectionShell>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Participations</p>
              <p className="text-3xl font-semibold">{stats.totalParticipations}</p>
              <p className="text-xs text-muted-foreground">Monthly benefit events</p>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2 flex items-start gap-2">
              <Trophy className="h-8 w-8 text-yellow-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">Benefits Received</p>
                <p className="text-3xl font-semibold">{stats.totalWins}</p>
                <p className="text-xs text-muted-foreground">Waiver benefits awarded</p>
              </div>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Waived</p>
              <p className="text-3xl font-semibold">{formatRupee(stats.totalWaived)}</p>
              <p className="text-xs text-muted-foreground">Total EMI waivers</p>
            </div>
          </ERPSectionShell>
        </div>

        {/* Lucky Draws Table Section */}
        <ERPSectionShell>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Participation History</h3>
              <p className="text-sm text-muted-foreground">
                View your SFEMI promotional benefit and waiver details
              </p>
            </div>

            {downloadError && (
              <div className="rounded-lg bg-red-50 p-3 border border-red-200 text-sm text-red-800">
                {downloadError}
              </div>
            )}

            {loading ? (
              <ERPLoadingState label="Loading promotional benefits..." />
            ) : error ? (
              <ERPErrorState
                title="Unable to load promotional benefits"
                message={error}
                onRetry={loadData}
              />
            ) : rows.length === 0 ? (
              <ERPEmptyState
                title="No promotional benefit events yet"
                description="Promotional benefit events occur monthly for active SFEMI subscriptions."
              />
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="space-y-2.5 md:hidden">
                  {rows.map((row) => {
                    const isWon = (row.status === "COMPLETED" && row.winner_status === "VERIFIED");
                    return (
                      <div
                        key={row.id}
                        className={`rounded-2xl border p-4 shadow-xs transition ${
                          isWon
                            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-foreground">
                              {row.batch_code ? `Batch ${row.batch_code}` : `Benefit Event #${row.id}`}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Date: {formatDate(row.draw_date)}
                            </div>
                          </div>
                          <ERPStatusBadge status={drawStatus(row)} />
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-2.5 text-xs">
                          <div>
                            <span className="text-muted-foreground">SFEMI ID</span>
                            <div className="font-mono font-bold text-foreground mt-0.5">{row.lucky_number ?? "—"}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">EMIs Waived</span>
                            <div className="font-bold text-foreground mt-0.5">{row.waived_emi_count ?? 0}</div>
                          </div>
                          {Number(row.waived_amount ?? 0) > 0 ? (
                            <div className="col-span-2 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/40 p-2 text-emerald-800 dark:text-emerald-300 font-bold">
                              Future EMIs Waived: {formatRupee(row.waived_amount)}
                            </div>
                          ) : null}
                        </div>

                        {isWon ? (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => handleDownloadCertificate(row.id)}
                              disabled={downloadingId === row.id}
                              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
                            >
                              <Download className="size-3.5" />
                              {downloadingId === row.id ? "Downloading..." : "Download Benefit Certificate"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block">
                  <DataTableShell>
                    <MobileSafeTable>
                      <DataTable<CustomerLuckyDraw>
                        columns={drawsColumns}
                        rows={rows}
                      />
                    </MobileSafeTable>
                  </DataTableShell>
                </div>
              </>
            )}
          </div>
        </ERPSectionShell>

        {/* Info Note */}
        <ERPAuditNote title="How SFEMI Promotional Benefits Work">
          Each month, promotional benefit selection is conducted from active eligible SFEMI subscriptions.
          When selected, remaining future EMI installments are waived! Your SFEMI ID is
          assigned when your subscription starts. You can verify the results and download your benefit certificate.
        </ERPAuditNote>
      </div>
    </ERPPageShell>
  );
}
