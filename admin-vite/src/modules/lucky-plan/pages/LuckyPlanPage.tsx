"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  ArrowRight,
  Clover,
  Coins,
  Eye,
  Grid2x2,
  Loader2,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
  Warehouse,
} from "lucide-react";

import { CommandBar } from "@/shared/ui/CommandBar";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { DataGrid } from "@/shared/tables/DataGrid";
import { EntityDrawer } from "@/shared/drawers/EntityDrawer";
import { EmptyState } from "@/shared/ui/EmptyState";
import { ErrorState } from "@/shared/ui/ErrorState";
import { LoadingState } from "@/shared/ui/LoadingState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { StatCard } from "@/modules/dashboard/components/StatCard";
import { useCurrentUser } from "@/shared/auth/useCurrentUser";
import { hasPermission } from "@/shared/permissions/permission-map";
import { useLuckyPlanBatches, useLuckyPlanBatch, useLuckyPlanBatchControlCenter, useLuckyPlanBatchSummary, useLuckyPlanDraw, useLuckyPlanDrawTimeline, useLuckyPlanDrawWinnerSettlement, useLuckyPlanDraws, useLuckyPlanLuckyIds } from "../api/luckyPlan.queries";
import type {
  LuckyPlanBatch,
  LuckyPlanDraw,
  LuckyPlanLuckyId,
} from "../api/luckyPlan.types";

type TabKey = "batches" | "lucky-ids" | "draws" | "winners" | "waivers" | "readiness";

const TAB_ORDER: Array<{ key: TabKey; label: string; description: string }> = [
  {
    key: "batches",
    label: "Batches",
    description: "Batch list, counts, and batch detail drawer.",
  },
  {
    key: "lucky-ids",
    label: "Lucky IDs",
    description: "100-slot grid, assignment state, and registry rows.",
  },
  {
    key: "draws",
    label: "Draws",
    description: "Monthly draw records and commit evidence.",
  },
  {
    key: "winners",
    label: "Winners",
    description: "Winner display and reveal status.",
  },
  {
    key: "waivers",
    label: "Waivers",
    description: "Winner settlement and future-EMI waiver record.",
  },
  {
    key: "readiness",
    label: "Readiness",
    description: "Lock, commit, and execute readiness signals.",
  },
];

type ViewBatch = LuckyPlanBatch;
type ViewLuckyId = LuckyPlanLuckyId;
type ViewDraw = LuckyPlanDraw;

function money(value: unknown): string {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "INR 0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatLuckyNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return String(value).padStart(2, "0");
}

function formatMaybeString(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "-";
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function statusTone(value: string | null | undefined) {
  const normalized = (value || "").trim().toUpperCase();
  if (normalized === "AVAILABLE" || normalized === "READY" || normalized === "REVEALED" || normalized === "PRESENT") return "success" as const;
  if (normalized === "ASSIGNED" || normalized === "ACTIVE" || normalized === "COMMITTED" || normalized === "OPEN") return "info" as const;
  if (normalized === "WON" || normalized === "COMPLETED" || normalized === "DRAW_COMPLETED") return "warning" as const;
  if (normalized.includes("BLOCKED") || normalized.includes("FROZEN") || normalized === "CANCELLED" || normalized === "NOT_CONFIGURED" || normalized === "ABSENT") return "danger" as const;
  return "neutral" as const;
}

function luckyStatusLabel(row?: ViewLuckyId | null) {
  if (!row) return "UNKNOWN";
  const state = String(row.assignment_state || row.status || "UNKNOWN").toUpperCase();
  if (state === "FROZEN" || state === "FROZEN_CANCELLED_HOLDER") return "BLOCKED";
  if (state === "RELEASED") return "AVAILABLE";
  return state;
}

function drawStatusLabel(draw?: ViewDraw | null) {
  if (!draw) return "UNKNOWN";
  return draw.is_revealed ? "REVEALED" : "PENDING";
}

function isInternalAdmin(role: string | undefined, isSuperuser: boolean | undefined) {
  return Boolean(isSuperuser || role === "ADMIN");
}

function DetailLine({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-stone-100 py-3 last:border-b-0">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="text-sm font-medium text-stone-800">{formatMaybeString(value)}</div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white/95 shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-stone-800">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TabButton({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-2xl border px-4 py-3 text-left transition",
        active
          ? "border-stone-900 bg-stone-900 text-white shadow-lg shadow-stone-200"
          : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50",
      ].join(" ")}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className={active ? "mt-1 text-xs text-stone-200" : "mt-1 text-xs text-stone-500"}>
        {description}
      </div>
    </button>
  );
}

function statusBadge(value: string | null | undefined) {
  const label = formatMaybeString(value);
  return <StatusBadge label={label} variant={statusTone(label)} />;
}

function buildLuckyGridCells(rows: ViewLuckyId[]) {
  const byNumber = new Map<number, ViewLuckyId>();
  for (const row of rows) {
    byNumber.set(row.lucky_number, row);
  }
  return Array.from({ length: 100 }, (_unused, index) => {
    const row = byNumber.get(index) ?? null;
    return {
      slot: index,
      row,
    };
  });
}

export function LuckyPlanPage() {
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser();
  const canView = Boolean(
    currentUser && hasPermission(currentUser.role, "lucky-plan.view"),
  );
  const canManage = isInternalAdmin(
    currentUser?.role,
    currentUser?.is_superuser,
  );

  const [activeTab, setActiveTab] = useState<TabKey>("batches");
  const [batchQuery, setBatchQuery] = useState("");
  const [batchStatus, setBatchStatus] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [selectedDrawId, setSelectedDrawId] = useState<number | null>(null);
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false);
  const [drawDrawerOpen, setDrawDrawerOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    variant?: "danger" | "default";
    onConfirm: (() => void) | null;
  }>({
    open: false,
    title: "",
    description: "",
    confirmLabel: "Confirm",
    variant: "default",
    onConfirm: null,
  });

  const batchesQuery = useLuckyPlanBatches({
    page: 1,
    page_size: 100,
    q: batchQuery.trim() || undefined,
    status: batchStatus || undefined,
  });
  const batchRows = useMemo(() => batchesQuery.data?.results ?? [], [batchesQuery.data?.results]);

  useEffect(() => {
    if (batchRows.length === 0) return;
    const firstBatch = batchRows[0];
    if (!firstBatch) return;
    if (!selectedBatchId) {
      setSelectedBatchId(firstBatch.id);
      return;
    }
    if (!batchRows.some((row) => row.id === selectedBatchId)) {
      setSelectedBatchId(firstBatch.id);
    }
  }, [batchRows, selectedBatchId]);

  const batchId = selectedBatchId ?? 0;
  const selectedBatchQuery = useLuckyPlanBatch(batchId);
  const selectedBatchSummaryQuery = useLuckyPlanBatchSummary(batchId);
  const selectedBatchControlQuery = useLuckyPlanBatchControlCenter(batchId);
  const selectedLuckyIdsQuery = useLuckyPlanLuckyIds({ batch_id: batchId, page: 1, page_size: 120 });
  const selectedDrawsQuery = useLuckyPlanDraws({ batch: batchId, page: 1, page_size: 120 });

  const luckyRows = useMemo(() => selectedLuckyIdsQuery.data?.results ?? [], [selectedLuckyIdsQuery.data?.results]);
  const drawRows = useMemo(() => selectedDrawsQuery.data?.results ?? [], [selectedDrawsQuery.data?.results]);
  const revealedDrawRows = useMemo(
    () => drawRows.filter((row) => row.is_revealed),
    [drawRows],
  );

  useEffect(() => {
    const sourceRows = activeTab === "winners" || activeTab === "waivers" ? revealedDrawRows : drawRows;
    if (sourceRows.length === 0) {
      setSelectedDrawId(null);
      return;
    }

    const firstDraw = sourceRows[0];
    if (!firstDraw) return;

    if (!selectedDrawId || !sourceRows.some((row) => row.id === selectedDrawId)) {
      setSelectedDrawId(firstDraw.id);
    }
  }, [activeTab, drawRows, revealedDrawRows, selectedDrawId, selectedBatchId]);

  const selectedDrawDetailQuery = useLuckyPlanDraw(selectedDrawId ?? 0);
  const selectedDrawTimelineQuery = useLuckyPlanDrawTimeline(selectedDrawId ?? 0);
  const selectedDrawSettlementQuery = useLuckyPlanDrawWinnerSettlement(selectedDrawId ?? 0);

  const batchSummary = selectedBatchSummaryQuery.data ?? null;
  const batchControl = selectedBatchControlQuery.data ?? null;
  const selectedBatch = selectedBatchQuery.data ?? null;
  const selectedDraw = selectedDrawDetailQuery.data ?? null;
  const selectedDrawTimeline = selectedDrawTimelineQuery.data?.results ?? [];
  const selectedDrawSettlement = selectedDrawSettlementQuery.data ?? null;

  const luckyGrid = useMemo(() => buildLuckyGridCells(luckyRows), [luckyRows]);
  const batchSummaryRows = useMemo(
    () => batchRows.map((row) => ({ ...row })),
    [batchRows],
  );

  const batchColumns = useMemo<ColumnDef<ViewBatch>[]>(
    () => [
      {
        accessorKey: "batch_code",
        header: "Batch",
        cell: ({ row }) => {
          const batch = row.original;
          return (
            <button
              onClick={() => {
                setSelectedBatchId(batch.id);
                setActiveTab("batches");
              }}
              className="text-left font-semibold text-stone-900 hover:underline"
            >
              {batch.batch_code}
            </button>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => statusBadge(row.original.status),
      },
      {
        accessorKey: "total_slots",
        header: "Slots",
        cell: ({ row }) => (
          <span className="tabular-nums text-stone-700">
            {row.original.total_slots}
          </span>
        ),
      },
      {
        accessorKey: "duration_months",
        header: "Tenure",
        cell: ({ row }) => (
          <span className="tabular-nums text-stone-700">
            {row.original.duration_months} mo
          </span>
        ),
      },
      {
        accessorKey: "subscription_count",
        header: "Subscriptions",
        cell: ({ row }) => (
          <span className="tabular-nums text-stone-700">
            {toNumber(row.original.subscription_count)}
          </span>
        ),
      },
      {
        accessorKey: "available_slots",
        header: "Available",
        cell: ({ row }) => (
          <span className="tabular-nums text-stone-700">
            {toNumber(row.original.available_slots)}
          </span>
        ),
      },
      {
        accessorKey: "winner_count",
        header: "Winners",
        cell: ({ row }) => (
          <span className="tabular-nums text-stone-700">
            {toNumber(row.original.winner_count)}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-stone-600">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            onClick={() => {
              setSelectedBatchId(row.original.id);
              setBatchDrawerOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            Open detail
            <ArrowRight size={14} />
          </button>
        ),
      },
    ],
    [],
  );

  const drawColumns = useMemo<ColumnDef<ViewDraw>[]>(
    () => [
      {
        accessorKey: "draw_month",
        header: "Draw",
        cell: ({ row }) => (
          <button
            onClick={() => {
              setSelectedDrawId(row.original.id);
              setDrawDrawerOpen(true);
              setActiveTab("draws");
            }}
            className="font-semibold text-stone-900 hover:underline"
          >
            Month {row.original.draw_month}
          </button>
        ),
      },
      {
        accessorKey: "is_revealed",
        header: "Status",
        cell: ({ row }) =>
          statusBadge(drawStatusLabel(row.original)),
      },
      {
        accessorKey: "committed_hash",
        header: "Commit Hash",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-stone-700">
            {formatMaybeString(row.original.committed_hash).slice(0, 18)}
          </span>
        ),
      },
      {
        accessorKey: "public_commit_hash",
        header: "Public Commit",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-stone-700">
            {formatMaybeString(row.original.public_commit_hash).slice(0, 18)}
          </span>
        ),
      },
      {
        accessorKey: "winner_lucky_number",
        header: "Winner Lucky ID",
        cell: ({ row }) => (
          <span className="tabular-nums text-stone-700">
            {formatLuckyNumber(row.original.winner_lucky_number)}
          </span>
        ),
      },
      {
        accessorKey: "winner_customer_name",
        header: "Winner",
        cell: ({ row }) => (
          <span className="text-stone-700">
            {formatMaybeString(row.original.winner_customer_name)}
          </span>
        ),
      },
      {
        accessorKey: "waived_amount",
        header: "Waived",
        cell: ({ row }) => money(row.original.waived_amount ?? 0),
      },
      {
        accessorKey: "revealed_at",
        header: "Revealed",
        cell: ({ row }) => formatDateTime(row.original.revealed_at),
      },
    ],
    [],
  );

  const winnerColumns = useMemo<ColumnDef<ViewDraw>[]>(
    () => [
      {
        accessorKey: "draw_month",
        header: "Winner draw",
        cell: ({ row }) => `Month ${row.original.draw_month}`,
      },
      {
        accessorKey: "winner_lucky_number",
        header: "Lucky ID",
        cell: ({ row }) => formatLuckyNumber(row.original.winner_lucky_number),
      },
      {
        accessorKey: "winner_customer_name",
        header: "Winner",
        cell: ({ row }) => formatMaybeString(row.original.winner_customer_name),
      },
      {
        accessorKey: "waived_emi_count",
        header: "Waived EMIs",
        cell: ({ row }) => formatMaybeString(row.original.waived_emi_count),
      },
      {
        accessorKey: "waived_amount",
        header: "Waived Amount",
        cell: ({ row }) => money(row.original.waived_amount ?? 0),
      },
      {
        accessorKey: "waiver_scope",
        header: "Waiver Scope",
        cell: ({ row }) => statusBadge(row.original.waiver_scope),
      },
      {
        accessorKey: "revealed_at",
        header: "Revealed At",
        cell: ({ row }) => formatDateTime(row.original.revealed_at),
      },
    ],
    [],
  );

  if (currentUserLoading) {
    return <LoadingState message="Loading Lucky Plan workbench..." />;
  }

  if (!currentUser || !canView) {
    return (
      <ErrorState
        title="Lucky Plan access restricted"
        message="Your account does not currently have Lucky Plan access in admin-vite."
      />
    );
  }

  const summaryCards = [
    {
      label: "Subscriptions",
      value: batchSummary?.subscription_count ?? selectedBatch?.subscription_count ?? 0,
      icon: Users,
      tone: "default" as const,
      sub: "Batch-linked contracts",
    },
    {
      label: "Lucky IDs",
      value: batchSummary?.assigned_lucky_ids ?? selectedBatch?.lucky_id_count ?? 0,
      icon: Grid2x2,
      tone: "info" as const,
      sub: "Assigned slots",
    },
    {
      label: "Winners",
      value: batchSummary?.won_lucky_ids ?? selectedBatch?.winner_count ?? 0,
      icon: Trophy,
      tone: "warning" as const,
      sub: "Winner-linked slots",
    },
    {
      label: "Draws",
      value: batchSummary?.draw_count ?? selectedBatch?.draw_count ?? 0,
      icon: Sparkles,
      tone: "success" as const,
      sub: "Batch draw records",
    },
    {
      label: "Monthly booked",
      value: batchSummary ? money(batchSummary.monthly_booked_value) : money(0),
      icon: Coins,
      tone: "default" as const,
      sub: "Backend total only",
    },
    {
      label: "Readiness",
      value: !selectedBatchId
        ? "Select batch"
        : batchControl?.minimum_threshold_met
          ? "Ready"
          : "Blocked",
      icon: ShieldAlert,
      tone: (!selectedBatchId
        ? "default"
        : batchControl?.minimum_threshold_met
          ? "success"
          : "danger") as "default" | "success" | "danger",
      sub: batchControl?.lock_status ?? "No batch selected",
    },
  ];

  const drawSummary = selectedDrawSettlement ?? {
    draw_id: selectedDraw?.id ?? 0,
    is_revealed: selectedDraw?.is_revealed ?? false,
    revealed_at: selectedDraw?.revealed_at ?? null,
    winner_lucky_id: selectedDraw?.winner_lucky_id ?? null,
    winner_lucky_number: selectedDraw?.winner_lucky_number ?? null,
    winner_subscription_id: selectedDraw?.winner_subscription_id ?? null,
    winner_subscription_number: selectedDraw?.winner_subscription_number ?? null,
    winner_customer_name: selectedDraw?.winner_customer_name ?? null,
    waived_emi_count: selectedDraw?.waived_emi_count ?? null,
    waived_amount: selectedDraw?.waived_amount ?? null,
    waiver_scope: selectedDraw?.waiver_scope ?? null,
    waived_emis: [],
  };

  return (
    <div className="space-y-6">
      <CommandBar />
      <div className="rounded-3xl border border-stone-200 bg-[linear-gradient(135deg,rgba(28,25,23,0.03),rgba(214,168,52,0.08),rgba(255,255,255,0.9))] p-6 shadow-sm">
        <PageHeader
          title="Lucky Plan Workbench"
          description="Batch, Lucky ID, draw, winner, waiver, and readiness visibility backed by Django."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => batchesQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                <Loader2 size={16} />
                Refresh
              </button>
              <button
                onClick={() => setBatchDrawerOpen(true)}
                disabled={!selectedBatchId}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Eye size={16} />
                Batch detail
              </button>
              <button
                onClick={() => setDrawDrawerOpen(true)}
                disabled={!selectedDrawId}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles size={16} />
                Draw detail
              </button>
            </div>
          }
        />

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {summaryCards.map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              icon={card.icon}
              tone={card.tone}
              sub={card.sub}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {TAB_ORDER.map((tab) => (
          <TabButton
            key={tab.key}
            active={activeTab === tab.key}
            label={tab.label}
            description={tab.description}
            onClick={() => setActiveTab(tab.key)}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <SectionCard
            title="Batch register"
            subtitle="Source-linked batch list. Selecting a batch loads the related grid, draws, winners, waivers, and readiness state."
            action={
              <div className="flex items-center gap-2">
                <input
                  value={batchQuery}
                  onChange={(event) => setBatchQuery(event.target.value)}
                  placeholder="Search batch code"
                  className="w-48 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-stone-500"
                />
                <select
                  value={batchStatus}
                  onChange={(event) => setBatchStatus(event.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
                >
                  <option value="">All statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="OPEN">Open</option>
                  <option value="FULL">Full</option>
                  <option value="READY_TO_LOCK">Ready to lock</option>
                  <option value="LOCKED">Locked</option>
                  <option value="DRAW_COMMITTED">Draw committed</option>
                  <option value="DRAW_COMPLETED">Draw completed</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
            }
          >
            {batchesQuery.isLoading ? (
              <LoadingState message="Loading batches..." />
            ) : batchesQuery.isError ? (
              <ErrorState
                title="Unable to load batches"
                message="The batch register could not be fetched from the backend."
                onRetry={() => batchesQuery.refetch()}
              />
            ) : batchRows.length === 0 ? (
              <EmptyState
                title="No batches found"
                description="No batch records match the current filter set."
              />
            ) : (
              <DataGrid data={batchSummaryRows} columns={batchColumns} />
            )}
          </SectionCard>

          {activeTab === "lucky-ids" ? (
            <SectionCard
              title="Lucky ID grid"
              subtitle="Numbers 00 to 99. Empty slots are shown defensively when the backend returns no row."
            >
              {!batchId ? (
                <EmptyState
                  title="Select a batch"
                  description="Lucky IDs are batch scoped. Pick a batch to load the 100-slot grid."
                />
              ) : selectedLuckyIdsQuery.isLoading ? (
                <LoadingState message="Loading Lucky IDs..." />
              ) : selectedLuckyIdsQuery.isError ? (
                <ErrorState
                  title="Unable to load Lucky IDs"
                  message="The Lucky ID register could not be fetched for this batch."
                  onRetry={() => selectedLuckyIdsQuery.refetch()}
                />
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <StatusBadge label="Available" variant="success" />
                    <StatusBadge label="Assigned" variant="info" />
                    <StatusBadge label="Won" variant="warning" />
                    <StatusBadge label="Blocked" variant="danger" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
                    {luckyGrid.map((cell) => {
                      const row = cell.row;
                      const label = row ? luckyStatusLabel(row) : "EMPTY";
                      const tone = row ? statusTone(label) : "neutral";
                      return (
                        <button
                          key={cell.slot}
                          onClick={() => row && setSelectedBatchId(row.batch)}
                          className={[
                            "rounded-xl border p-3 text-left transition",
                            row
                              ? tone === "success"
                                ? "border-emerald-200 bg-emerald-50"
                                : tone === "info"
                                  ? "border-sky-200 bg-sky-50"
                                  : tone === "warning"
                                    ? "border-amber-200 bg-amber-50"
                                    : "border-red-200 bg-red-50"
                              : "border-dashed border-stone-200 bg-stone-50",
                          ].join(" ")}
                        >
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                            {String(cell.slot).padStart(2, "0")}
                          </div>
                          <div className="mt-2">
                            {row ? (
                              <StatusBadge label={label} variant={statusTone(label)} />
                            ) : (
                              <StatusBadge label="EMPTY" variant="neutral" />
                            )}
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-stone-600">
                            <div>{row ? formatMaybeString(row.customer_name) : "No backend row"}</div>
                            <div>{row ? formatMaybeString(row.subscription_number) : "Awaiting record"}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </SectionCard>
          ) : null}

          {activeTab === "draws" || activeTab === "winners" || activeTab === "waivers" ? (
            <SectionCard
              title={
                activeTab === "draws"
                  ? "Draw records"
                  : activeTab === "winners"
                    ? "Winner records"
                    : "Waiver records"
              }
              subtitle="Draw and winner display is backend sourced. The frontend never recalculates the winner or waiver outcome."
            >
              {!batchId ? (
                <EmptyState
                  title="Select a batch"
                  description="Draw records are batch scoped."
                />
              ) : selectedDrawsQuery.isLoading ? (
                <LoadingState message="Loading draw records..." />
              ) : selectedDrawsQuery.isError ? (
                <ErrorState
                  title="Unable to load draw records"
                  message="The draw register could not be fetched for this batch."
                  onRetry={() => selectedDrawsQuery.refetch()}
                />
              ) : drawRows.length === 0 ? (
                <EmptyState
                  title="No draw records"
                  description="The backend has not published draw rows for this batch yet."
                />
              ) : (
                <DataGrid
                  data={activeTab === "winners" || activeTab === "waivers" ? revealedDrawRows : drawRows}
                  columns={activeTab === "draws" ? drawColumns : winnerColumns}
                />
              )}
            </SectionCard>
          ) : null}

          {activeTab === "readiness" ? (
            <SectionCard
              title="Readiness panel"
              subtitle="This panel summarizes lock, snapshot, commit, and execute readiness from backend control-center data."
            >
              {!batchId ? (
                <EmptyState
                  title="Select a batch"
                  description="Readiness is batch scoped."
                />
              ) : selectedBatchControlQuery.isLoading ? (
                <LoadingState message="Loading readiness..." />
              ) : selectedBatchControlQuery.isError ? (
                <ErrorState
                  title="Unable to load readiness"
                  message="The control-center endpoint could not be fetched for this batch."
                  onRetry={() => selectedBatchControlQuery.refetch()}
                />
              ) : batchControl ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex items-center gap-2">
                      <Warehouse size={16} className="text-stone-500" />
                      <h3 className="font-semibold text-stone-800">Control state</h3>
                    </div>
                    <div className="mt-3 space-y-1">
                      <DetailLine label="Batch status" value={batchControl.batch_status} />
                      <DetailLine label="Lock status" value={batchControl.lock_status} />
                      <DetailLine label="Snapshot status" value={batchControl.snapshot_status} />
                      <DetailLine label="Commit status" value={batchControl.commit_status} />
                      <DetailLine label="Draw status" value={batchControl.draw_status} />
                      <DetailLine label="Winner lucky ID" value={batchControl.winner_lucky_number == null ? "-" : formatLuckyNumber(batchControl.winner_lucky_number)} />
                      <DetailLine label="Finance waiver posting" value={batchControl.finance_waiver_posting_status} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={16} className="text-stone-500" />
                      <h3 className="font-semibold text-stone-800">Blockers</h3>
                    </div>
                    <div className="mt-3 space-y-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Lock batch
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {batchControl.disabled_reasons.lock_batch.length > 0 ? (
                            batchControl.disabled_reasons.lock_batch.map((reason) => (
                              <StatusBadge key={reason} label={reason} variant="danger" />
                            ))
                          ) : (
                            <StatusBadge label="No blockers" variant="success" />
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Commit draw
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {batchControl.disabled_reasons.commit_draw.length > 0 ? (
                            batchControl.disabled_reasons.commit_draw.map((reason) => (
                              <StatusBadge key={reason} label={reason} variant="danger" />
                            ))
                          ) : (
                            <StatusBadge label="No blockers" variant="success" />
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Execute draw
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {batchControl.disabled_reasons.execute_draw.length > 0 ? (
                            batchControl.disabled_reasons.execute_draw.map((reason) => (
                              <StatusBadge key={reason} label={reason} variant="danger" />
                            ))
                          ) : (
                            <StatusBadge label="No blockers" variant="success" />
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Dangerous draw mutations stay backend-authorized. This phase keeps the workbench read-only and surfaces the backend readiness state only.
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Selected batch"
            subtitle="Details follow the batch chosen from the register."
            action={
              <button
                onClick={() => setBatchDrawerOpen(true)}
                disabled={!selectedBatchId}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Open drawer
              </button>
            }
          >
            {!selectedBatchId ? (
              <EmptyState
                title="No batch selected"
                description="Pick a batch from the register to load Lucky IDs, draws, winners, waivers, and readiness."
              />
            ) : selectedBatchQuery.isLoading ? (
              <LoadingState message="Loading selected batch..." />
            ) : selectedBatchQuery.isError ? (
              <ErrorState
                title="Unable to load batch"
                message="The selected batch detail could not be fetched from the backend."
                onRetry={() => selectedBatchQuery.refetch()}
              />
            ) : selectedBatch ? (
              <div className="space-y-1">
                <DetailLine label="Batch code" value={selectedBatch.batch_code} />
                <DetailLine label="Status" value={selectedBatch.status} />
                <DetailLine label="Slots" value={selectedBatch.total_slots} />
                <DetailLine label="Duration" value={`${selectedBatch.duration_months} months`} />
                <DetailLine label="Draw day" value={selectedBatch.draw_day} />
                <DetailLine label="Start date" value={formatDate(selectedBatch.start_date)} />
                <DetailLine label="Locked at" value={formatDateTime(selectedBatch.locked_at)} />
                <DetailLine label="Available slots" value={selectedBatch.available_slots ?? "-"} />
                <DetailLine label="Lucky ID rows" value={selectedBatch.lucky_id_count ?? "-"} />
                <DetailLine label="Winner rows" value={selectedBatch.winner_count ?? "-"} />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Winner summary"
            subtitle="No frontend winner calculation. These values come from the selected draw record or settlement endpoint."
            action={
              <button
                onClick={() => setDrawDrawerOpen(true)}
                disabled={!selectedDrawId}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Open winner drawer
              </button>
            }
          >
            {!selectedDrawId ? (
              <EmptyState
                title="No draw selected"
                description="Select a draw row to see the winner summary."
              />
            ) : selectedDrawSettlementQuery.isLoading ? (
              <LoadingState message="Loading winner summary..." />
            ) : selectedDrawSettlementQuery.isError ? (
              <ErrorState
                title="Unable to load winner summary"
                message="The winner-settlement endpoint could not be fetched."
                onRetry={() => selectedDrawSettlementQuery.refetch()}
              />
            ) : drawSummary ? (
              <div className="space-y-1">
                <DetailLine label="Draw ID" value={drawSummary.draw_id ? `#${drawSummary.draw_id}` : "-"} />
                <DetailLine label="Winner lucky ID" value={drawSummary.winner_lucky_number == null ? "-" : formatLuckyNumber(drawSummary.winner_lucky_number)} />
                <DetailLine label="Winner customer" value={drawSummary.winner_customer_name} />
                <DetailLine label="Winner subscription" value={drawSummary.winner_subscription_number} />
                <DetailLine label="Waiver scope" value={drawSummary.waiver_scope} />
                <DetailLine label="Waived EMI count" value={drawSummary.waived_emi_count} />
                <DetailLine label="Waived amount" value={drawSummary.waived_amount ? money(drawSummary.waived_amount) : "-"} />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Selected draw evidence"
            subtitle="Commit hash, winner linkage, and timeline from the selected draw."
          >
            {!selectedDrawId ? (
              <EmptyState
                title="No draw selected"
                description="Use the draw table to select a record."
              />
            ) : selectedDrawDetailQuery.isLoading ? (
              <LoadingState message="Loading draw detail..." />
            ) : selectedDrawDetailQuery.isError ? (
              <ErrorState
                title="Unable to load draw detail"
                message="The selected draw detail could not be fetched."
                onRetry={() => selectedDrawDetailQuery.refetch()}
              />
            ) : selectedDraw ? (
              <div className="space-y-1">
                <DetailLine label="Draw month" value={selectedDraw.draw_month} />
                <DetailLine label="Status" value={selectedDraw.is_revealed ? "REVEALED" : "PENDING"} />
                <DetailLine label="Batch code" value={selectedDraw.batch_code} />
                <DetailLine label="Committed hash" value={selectedDraw.committed_hash} />
                <DetailLine label="Public commit hash" value={selectedDraw.public_commit_hash} />
                <DetailLine label="Winner lucky ID" value={selectedDraw.winner_lucky_number == null ? "-" : formatLuckyNumber(selectedDraw.winner_lucky_number)} />
                <DetailLine label="Winner customer" value={selectedDraw.winner_customer_name} />
                <DetailLine label="Revealed at" value={formatDateTime(selectedDraw.revealed_at)} />
                <DetailLine label="Waived EMI count" value={selectedDraw.waived_emi_count} />
                <DetailLine label="Waived amount" value={selectedDraw.waived_amount ? money(selectedDraw.waived_amount) : "-"} />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Timeline"
            subtitle="Audit trail returned by the draw timeline endpoint."
          >
            {!selectedDrawId ? (
              <EmptyState
                title="No draw selected"
                description="Timeline is available after selecting a draw row."
              />
            ) : selectedDrawTimelineQuery.isLoading ? (
              <LoadingState message="Loading timeline..." />
            ) : selectedDrawTimelineQuery.isError ? (
              <ErrorState
                title="Unable to load timeline"
                message="The timeline endpoint could not be fetched."
                onRetry={() => selectedDrawTimelineQuery.refetch()}
              />
            ) : selectedDrawTimeline.length === 0 ? (
              <EmptyState
                title="No timeline entries"
                description="The backend returned no audit rows for this draw."
              />
            ) : (
              <div className="space-y-3">
                {selectedDrawTimeline.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-stone-800">
                        {item.action_type}
                      </div>
                      <div className="text-xs text-stone-500">
                        {formatDateTime(item.created_at)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-stone-600">
                      {item.performed_by ? `By ${item.performed_by}` : "System event"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <EntityDrawer
        open={batchDrawerOpen}
        onClose={() => setBatchDrawerOpen(false)}
        title="Batch detail"
        width="w-[720px]"
      >
        {!selectedBatchId ? (
          <EmptyState
            title="No batch selected"
            description="Choose a batch from the register first."
          />
        ) : selectedBatchQuery.isLoading || selectedBatchSummaryQuery.isLoading || selectedBatchControlQuery.isLoading ? (
          <LoadingState message="Loading batch detail..." />
        ) : selectedBatchQuery.isError || selectedBatchSummaryQuery.isError || selectedBatchControlQuery.isError ? (
          <ErrorState
            title="Unable to load batch detail"
            message="One or more batch endpoints failed to load."
            onRetry={() => {
              void selectedBatchQuery.refetch();
              void selectedBatchSummaryQuery.refetch();
              void selectedBatchControlQuery.refetch();
            }}
          />
        ) : selectedBatch ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center gap-2">
                <Clover size={18} className="text-stone-600" />
                <h3 className="font-semibold text-stone-800">{selectedBatch.batch_code}</h3>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {statusBadge(selectedBatch.status)}
                {batchControl ? statusBadge(batchControl.lock_status) : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Slots</div>
                  <div className="mt-1 text-lg font-semibold text-stone-900">
                    {selectedBatch.total_slots}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Duration</div>
                  <div className="mt-1 text-lg font-semibold text-stone-900">
                    {selectedBatch.duration_months} months
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Draw day</div>
                  <div className="mt-1 text-lg font-semibold text-stone-900">
                    {selectedBatch.draw_day}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Locked at</div>
                  <div className="mt-1 text-sm font-semibold text-stone-900">
                    {formatDateTime(selectedBatch.locked_at)}
                  </div>
                </div>
              </div>
            </div>

            {batchSummary ? (
              <div className="rounded-2xl border border-stone-200 p-4">
                <h4 className="font-semibold text-stone-800">Batch summary</h4>
                <div className="mt-3 space-y-1">
                  <DetailLine label="Subscriptions" value={batchSummary.subscription_count} />
                  <DetailLine label="Active subscriptions" value={batchSummary.active_subscription_count} />
                  <DetailLine label="Won subscriptions" value={batchSummary.won_subscription_count} />
                  <DetailLine label="Available Lucky IDs" value={batchSummary.available_lucky_ids} />
                  <DetailLine label="Assigned Lucky IDs" value={batchSummary.assigned_lucky_ids} />
                  <DetailLine label="Won Lucky IDs" value={batchSummary.won_lucky_ids} />
                  <DetailLine label="Draw eligible" value={batchSummary.draw_eligible_count} />
                </div>
              </div>
            ) : null}

            {batchControl ? (
              <div className="rounded-2xl border border-stone-200 p-4">
                <h4 className="font-semibold text-stone-800">Readiness snapshot</h4>
                <div className="mt-3 space-y-1">
                  <DetailLine label="Snapshot status" value={batchControl.snapshot_status} />
                  <DetailLine label="Snapshot rows" value={batchControl.snapshot_row_count} />
                  <DetailLine label="Commit status" value={batchControl.commit_status} />
                  <DetailLine label="Draw status" value={batchControl.draw_status} />
                  <DetailLine label="Winner lucky ID" value={batchControl.winner_lucky_number == null ? "-" : formatLuckyNumber(batchControl.winner_lucky_number)} />
                  <DetailLine label="Finance waiver posting" value={batchControl.finance_waiver_posting_status} />
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Batch create/update mutations are supported in the API layer, but this phase keeps the workbench read-only for batch mutations and draw mutations.
            </div>
          </div>
        ) : null}
      </EntityDrawer>

      <EntityDrawer
        open={drawDrawerOpen}
        onClose={() => setDrawDrawerOpen(false)}
        title="Draw detail"
        width="w-[720px]"
      >
        {!selectedDrawId ? (
          <EmptyState
            title="No draw selected"
            description="Choose a draw row from the register."
          />
        ) : selectedDrawDetailQuery.isLoading || selectedDrawSettlementQuery.isLoading || selectedDrawTimelineQuery.isLoading ? (
          <LoadingState message="Loading draw detail..." />
        ) : selectedDrawDetailQuery.isError || selectedDrawSettlementQuery.isError || selectedDrawTimelineQuery.isError ? (
          <ErrorState
            title="Unable to load draw detail"
            message="One or more draw endpoints failed to load."
            onRetry={() => {
              void selectedDrawDetailQuery.refetch();
              void selectedDrawSettlementQuery.refetch();
              void selectedDrawTimelineQuery.refetch();
            }}
          />
        ) : selectedDraw ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-stone-600" />
                <h3 className="font-semibold text-stone-800">
                  Month {selectedDraw.draw_month}
                </h3>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {statusBadge(drawStatusLabel(selectedDraw))}
                {statusBadge(selectedDraw.verification_status)}
                {statusBadge(selectedDraw.public_verification_status)}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Winner lucky ID</div>
                  <div className="mt-1 text-lg font-semibold text-stone-900">
                    {selectedDraw.winner_lucky_number == null ? "-" : formatLuckyNumber(selectedDraw.winner_lucky_number)}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Winner</div>
                  <div className="mt-1 text-sm font-semibold text-stone-900">
                    {formatMaybeString(selectedDraw.winner_customer_name)}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Waived EMI count</div>
                  <div className="mt-1 text-lg font-semibold text-stone-900">
                    {formatMaybeString(selectedDrawSettlement?.waived_emi_count ?? selectedDraw.waived_emi_count)}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Waived amount</div>
                  <div className="mt-1 text-sm font-semibold text-stone-900">
                    {money(selectedDrawSettlement?.waived_amount ?? selectedDraw.waived_amount ?? 0)}
                  </div>
                </div>
              </div>
            </div>

            {selectedDrawSettlement ? (
              <div className="rounded-2xl border border-stone-200 p-4">
                <h4 className="font-semibold text-stone-800">Winner settlement</h4>
                <div className="mt-3 space-y-1">
                  <DetailLine label="Winner subscription" value={selectedDrawSettlement.winner_subscription_number} />
                  <DetailLine label="Winner customer" value={selectedDrawSettlement.winner_customer_name} />
                  <DetailLine label="Winner lucky ID" value={selectedDrawSettlement.winner_lucky_number == null ? "-" : formatLuckyNumber(selectedDrawSettlement.winner_lucky_number)} />
                  <DetailLine label="Waiver scope" value={selectedDrawSettlement.waiver_scope} />
                  <DetailLine label="Waived EMI count" value={selectedDrawSettlement.waived_emi_count} />
                  <DetailLine label="Waived amount" value={selectedDrawSettlement.waived_amount ? money(selectedDrawSettlement.waived_amount) : "-"} />
                </div>
                <div className="mt-4">
                  <div className="text-sm font-semibold text-stone-800">Waived EMI rows</div>
                  {selectedDrawSettlement.waived_emis.length === 0 ? (
                    <div className="mt-2 text-sm text-stone-500">No backend waiver rows were returned.</div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {selectedDrawSettlement.waived_emis.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-stone-800">
                              EMI {row.month_no}
                            </div>
                            <div className="text-stone-600">{row.status}</div>
                          </div>
                          <div className="mt-1 text-stone-500">
                            {formatDate(row.due_date)} - {money(row.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-stone-200 p-4">
              <h4 className="font-semibold text-stone-800">Timeline</h4>
              <div className="mt-3 space-y-2">
                {selectedDrawTimeline.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-stone-800">{item.action_type}</div>
                      <div className="text-xs text-stone-500">
                        {formatDateTime(item.created_at)}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      {item.performed_by ? `By ${item.performed_by}` : "System event"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Draw commit and reveal mutations exist in the API surface, but this phase keeps admin-vite read-only for draw execution.
            </div>
          </div>
        ) : null}
      </EntityDrawer>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        variant={confirmState.variant}
        onCancel={() =>
          setConfirmState({
            open: false,
            title: "",
            description: "",
            confirmLabel: "Confirm",
            variant: "default",
            onConfirm: null,
          })
        }
        onConfirm={() => {
          confirmState.onConfirm?.();
          setConfirmState({
            open: false,
            title: "",
            description: "",
            confirmLabel: "Confirm",
            variant: "default",
            onConfirm: null,
          });
        }}
      />

      {!canManage ? (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
          Lucky Plan management actions are intentionally hidden for this role. Read-only visibility remains available where backend permissions allow.
        </div>
      ) : null}
    </div>
  );
}
