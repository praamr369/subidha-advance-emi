"use client";
import { RefreshCw, Download, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ERPAuditNote,
  ERPDataToolbar,
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import ActionButton from "@/components/ui/ActionButton";
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
  return "Failed to load lucky draws.";
}

function drawStatus(record: CustomerLuckyDraw): string {
  if (record.status === "COMPLETED" && record.winner_status === "VERIFIED") {
    return "WON";
  }
  return record.status || "PENDING";
}

function statusVariant(record: CustomerLuckyDraw): "success" | "warning" | "info" | "default" {
  if (record.status === "COMPLETED" && record.winner_status === "VERIFIED") {
    return "success";
  }
  if (record.status === "COMPLETED") return "info";
  return "warning";
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
      label: "Batch / Month",
      render: (row) => row.batch_code || `Batch ${row.batch}`,
    },
    {
      key: "lucky_number",
      label: "Lucky Number",
      render: (row) => row.lucky_number || "—",
    },
    {
      key: "draw_date",
      label: "Draw Date",
      render: (row) => formatDate(row.draw_date),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <ERPStatusBadge
          status={drawStatus(row)}
          variant={statusVariant(row)}
        />
      ),
    },
    {
      key: "waived_emi_count",
      label: "EMIs Waived",
      render: (row) => row.waived_emi_count || 0,
    },
    {
      key: "waived_amount",
      label: "Waiver Amount",
      render: (row) => formatRupee(row.waived_amount),
    },
    {
      key: "actions",
      label: "Action",
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
    <ERPPageShell title="Lucky Draws">
      <div className="space-y-6">
        {/* Lucky Draw Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ERPSectionShell>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Participations</p>
              <p className="text-3xl font-semibold">{stats.totalParticipations}</p>
              <p className="text-xs text-muted-foreground">Monthly lucky draws</p>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2 flex items-start gap-2">
              <Trophy className="h-8 w-8 text-yellow-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">Total Wins</p>
                <p className="text-3xl font-semibold">{stats.totalWins}</p>
                <p className="text-xs text-muted-foreground">Lucky draw wins</p>
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
                View your lucky draw participation and waiver details
              </p>
            </div>

            {downloadError && (
              <div className="rounded-lg bg-red-50 p-3 border border-red-200 text-sm text-red-800">
                {downloadError}
              </div>
            )}

            {loading ? (
              <ERPLoadingState message="Loading lucky draws..." />
            ) : error ? (
              <ERPErrorState
                message={error}
                action={
                  <ActionButton onClick={loadData} icon={RefreshCw} label="Retry" />
                }
              />
            ) : rows.length === 0 ? (
              <ERPEmptyState message="No lucky draws yet. Lucky draws happen monthly for active subscriptions." />
            ) : (
              <>
                <ERPDataToolbar
                  total={stats.totalParticipations}
                  showing={rows.length}
                  onRefresh={loadData}
                />
                <DataTableShell>
                  <MobileSafeTable>
                    <DataTable<CustomerLuckyDraw>
                      columns={drawsColumns}
                      rows={rows}
                      keyExtractor={(row) => `lucky-draw-${row.id}`}
                    />
                  </MobileSafeTable>
                </DataTableShell>
              </>
            )}
          </div>
        </ERPSectionShell>

        {/* Info Note */}
        <ERPAuditNote
          icon="info"
          title="How Lucky Draws Work"
          description="Every month, we conduct a draw from all active EMI subscriptions. If you win, your monthly EMI amount is waived! Your lucky number is automatically assigned when your subscription starts. You can verify the draw results and download your certificate if you win."
        />
      </div>
    </ERPPageShell>
  );
}
