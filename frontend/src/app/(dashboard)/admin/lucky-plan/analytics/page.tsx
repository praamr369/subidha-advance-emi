"use client";
import { RefreshCw, TrendingUp, Users, Award } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  ERPAuditNote,
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
} from "@/components/erp";
import ActionButton from "@/components/ui/ActionButton";
import { listLuckyDraws, getBatchDrawSummary } from "@/services/draws";

function formatRupee(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "₹0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface AnalyticsData {
  totalDraws: number;
  totalWinners: number;
  totalWaivers: number;
  averageWaiverAmount: number;
  successRate: number;
}

export default function LuckyPlanAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalDraws: 0,
    totalWinners: 0,
    totalWaivers: 0,
    averageWaiverAmount: 0,
    successRate: 0,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const drawsResponse = await listLuckyDraws();
      const allDraws = drawsResponse.results || [];

      const completedDraws = allDraws.filter((d) => d.id);
      const winners = completedDraws.filter(
        (d) => d.winner_lucky_number !== null && d.winner_customer_name
      );

      const totalWaived = completedDraws.reduce((sum, d) => {
        const amount =
          typeof d.waived_amount === "string"
            ? parseFloat(d.waived_amount)
            : d.waived_amount || 0;
        return sum + amount;
      }, 0);

      const avgWaiver =
        winners.length > 0 ? totalWaived / winners.length : 0;
      const successRate =
        completedDraws.length > 0
          ? (winners.length / completedDraws.length) * 100
          : 0;

      setAnalytics({
        totalDraws: completedDraws.length,
        totalWinners: winners.length,
        totalWaivers: totalWaived,
        averageWaiverAmount: avgWaiver,
        successRate: successRate,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <ERPPageShell title="Lucky Plan Analytics">
        <ERPLoadingState message="Loading analytics..." />
      </ERPPageShell>
    );
  }

  if (error) {
    return (
      <ERPPageShell title="Lucky Plan Analytics">
        <ERPErrorState
          message={error}
          action={
            <ActionButton onClick={loadData} icon={RefreshCw} label="Retry" />
          }
        />
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell title="Lucky Plan Analytics">
      <div className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <ERPSectionShell>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Total Draws</p>
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-3xl font-semibold">{analytics.totalDraws}</p>
              <p className="text-xs text-muted-foreground">Completed draws</p>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Total Winners</p>
                <Award className="h-5 w-5 text-yellow-600" />
              </div>
              <p className="text-3xl font-semibold">{analytics.totalWinners}</p>
              <p className="text-xs text-muted-foreground">Verified winners</p>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Total Waived</p>
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-2xl font-semibold">
                {formatRupee(analytics.totalWaivers)}
              </p>
              <p className="text-xs text-muted-foreground">Total EMI value</p>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Avg Waiver/Winner</p>
              <p className="text-2xl font-semibold">
                {formatRupee(analytics.averageWaiverAmount)}
              </p>
              <p className="text-xs text-muted-foreground">Average amount</p>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Success Rate</p>
              <p className="text-3xl font-semibold">
                {analytics.successRate.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">Draw completion</p>
            </div>
          </ERPSectionShell>
        </div>

        {/* Summary Section */}
        <ERPSectionShell>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Performance Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Draw Completion Rate</span>
                  <span className="font-semibold">
                    {analytics.totalDraws}/{analytics.totalDraws}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: "100%" }}
                  ></div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Winner Verification Rate</span>
                  <span className="font-semibold">
                    {analytics.totalWinners}/{analytics.totalDraws}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${analytics.totalDraws > 0 ? (analytics.totalWinners / analytics.totalDraws) * 100 : 0}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </ERPSectionShell>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ERPAuditNote
            icon="info"
            title="Draw Statistics"
            description={`Monthly lucky draws with ${analytics.totalWinners} winners. Average EMI waiver per winner: ${formatRupee(analytics.averageWaiverAmount)}`}
          />
          <ERPAuditNote
            icon="info"
            title="Business Impact"
            description={`Total customer value created through lucky draw waivers: ${formatRupee(analytics.totalWaivers)}`}
          />
        </div>

        {/* Action Section */}
        <ERPSectionShell>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                href="/admin/lucky-plan/winners"
                label="View All Winners"
              />
              <ActionButton
                href="/admin/lucky-plan/draws"
                label="Manage Draws"
              />
              <ActionButton
                href="/admin/lucky-plan/batches"
                label="Batch Configuration"
              />
              <ActionButton onClick={loadData} icon={RefreshCw} label="Refresh" />
            </div>
          </div>
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
