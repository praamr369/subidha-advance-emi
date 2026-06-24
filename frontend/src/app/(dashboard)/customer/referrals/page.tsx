"use client";
import { formatRupee } from "@/lib/utils/currency";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
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
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import {
  listCustomerReferrals,
  type CustomerReferralRecord,
  type CustomerReferralListResponse,
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load referrals.";
}

function commissionStatus(record: CustomerReferralRecord): "PENDING" | "APPROVED" {
  return record.commission_approved ? "APPROVED" : "PENDING";
}

export default function CustomerReferralsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<CustomerReferralRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<{
    total_referrals: number;
    approved_commissions: number;
    total_approved_commission_amount: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response: CustomerReferralListResponse =
        await listCustomerReferrals();
      setRows(response.results || []);
      setSummaryData(response.commission_summary);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalApprovedAmount = useMemo(() => {
    return summaryData?.total_approved_commission_amount || "0.00";
  }, [summaryData]);

  const totalReferrals = useMemo(() => {
    return summaryData?.total_referrals || 0;
  }, [summaryData]);

  const approvedReferrals = useMemo(() => {
    return summaryData?.approved_commissions || 0;
  }, [summaryData]);

  const pendingReferrals = useMemo(() => {
    return totalReferrals - approvedReferrals;
  }, [totalReferrals, approvedReferrals]);

  const commissionColumns: Column<CustomerReferralRecord>[] = [
    {
      key: "referred_name",
      title: "Referred Customer",
      render: (row) => row.referred_name || "—",
    },
    {
      key: "referred_phone",
      title: "Phone",
      render: (row) => row.referred_phone || "—",
    },
    {
      key: "created_at",
      title: "Referred Date",
      render: (row) => formatDate(row.created_at),
    },
    {
      key: "notes",
      title: "Notes",
      render: (row) => row.notes || "—",
    },
    {
      key: "commission_amount",
      title: "Commission",
      render: (row) => formatRupee(row.commission_amount),
    },
    {
      key: "commission_status",
      title: "Status",
      render: (row) => <ERPStatusBadge status={commissionStatus(row)} />,
    },
  ];

  return (
    <ERPPageShell title="Referrals">
      <div className="space-y-6">
        {/* Commission Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ERPSectionShell>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Referrals</p>
              <p className="text-3xl font-semibold">{totalReferrals}</p>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Approved Referrals</p>
              <p className="text-3xl font-semibold">{approvedReferrals}</p>
              <p className="text-xs text-muted-foreground">
                Commission: {formatRupee(totalApprovedAmount)}
              </p>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Pending Referrals</p>
              <p className="text-3xl font-semibold">{pendingReferrals}</p>
              <p className="text-xs text-muted-foreground">Awaiting approval</p>
            </div>
          </ERPSectionShell>
        </div>

        {/* Referrals Table Section */}
        <ERPSectionShell>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Referral History</h3>
                <p className="text-sm text-muted-foreground">
                  Manage your referrals and track commission status
                </p>
              </div>
              <ActionButton
                onClick={() => {
                  router.push("/customer/referrals/new");
                }}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                New Referral
              </ActionButton>
            </div>

            {loading ? (
              <ERPLoadingState label="Loading referrals..." />
            ) : error ? (
              <ERPErrorState
                title="Unable to load referrals"
                message={error}
                onRetry={loadData}
              />
            ) : rows.length === 0 ? (
              <ERPEmptyState
                title="No referrals yet"
                description="Start referring customers to earn commissions!"
              />
            ) : (
              <DataTableShell>
                <MobileSafeTable>
                  <DataTable<CustomerReferralRecord>
                    columns={commissionColumns}
                    rows={rows}
                  />
                </MobileSafeTable>
              </DataTableShell>
            )}
          </div>
        </ERPSectionShell>

        {/* Info Note */}
        <ERPAuditNote title="Commission Policy">
          Commissions are earned when you refer a new customer. Commission
          approval depends on the customer&apos;s subscription status and payment
          history.
        </ERPAuditNote>
      </div>
    </ERPPageShell>
  );
}
