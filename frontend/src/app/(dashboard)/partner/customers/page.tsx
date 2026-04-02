"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { RefreshCw, Search, ShieldCheck, Users } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PaginationControls from "@/components/ui/PaginationControls";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  listPartnerCustomersRegister,
  type PartnerCustomerRegisterResponse,
} from "@/services/partner/registers";
import type { PartnerCustomer } from "@/services/partner";

const PAGE_SIZE = 25;

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load customers.";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type KycFilter = "" | "NOT_PROVIDED" | "PENDING" | "APPROVED" | "VERIFIED" | "REJECTED";

export default function PartnerCustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") || "").trim();
  const kycStatus = ((searchParams.get("kyc_status") || "").trim().toUpperCase() || "") as KycFilter;
  const currentPage = Math.max(Number(searchParams.get("page") || 1), 1);

  const [rows, setRows] = useState<PartnerCustomer[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(currentPage);
  const [numPages, setNumPages] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(q);
  const [kycInput, setKycInput] = useState<KycFilter>(kycStatus);

  useEffect(() => {
    setSearchInput(q);
    setKycInput(kycStatus);
    setPage(currentPage);
  }, [kycStatus, q, currentPage]);

  const loadCustomers = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const data: PartnerCustomerRegisterResponse = await listPartnerCustomersRegister({
          q: q || undefined,
          kycStatus: kycStatus || undefined,
          page: currentPage,
          pageSize: PAGE_SIZE,
        });

        setRows(Array.isArray(data.results) ? data.results : []);
        setCount(data.count);
        setPage(data.page);
        setNumPages(data.num_pages);
        setHasNext(data.has_next);
        setHasPrevious(data.has_previous);
        setError(null);
      } catch (err) {
        setError(normalizeError(err));
        setRows([]);
        setCount(0);
        setNumPages(0);
        setHasNext(false);
        setHasPrevious(false);
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [currentPage, kycStatus, q]
  );

  useEffect(() => {
    void loadCustomers("initial");
  }, [loadCustomers]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    const nextQuery = searchInput.trim();

    if (nextQuery) next.set("q", nextQuery);
    if (kycInput) next.set("kyc_status", kycInput);

    const queryString = next.toString();
    router.replace(queryString ? `/partner/customers?${queryString}` : "/partner/customers");
  }

  function handleReset() {
    setSearchInput("");
    setKycInput("");
    router.replace("/partner/customers");
  }

  function replacePage(targetPage: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (kycStatus) next.set("kyc_status", kycStatus);
    if (targetPage > 1) next.set("page", String(targetPage));
    const queryString = next.toString();
    router.replace(queryString ? `/partner/customers?${queryString}` : "/partner/customers");
  }

  const pagePendingKyc = useMemo(
    () => rows.filter((row) => String(row.kyc_status || "").toUpperCase() === "PENDING").length,
    [rows]
  );

  const pageVerifiedKyc = useMemo(
    () =>
      rows.filter((row) => {
        const token = String(row.kyc_status || "").toUpperCase();
        return token === "APPROVED" || token === "VERIFIED";
      }).length,
    [rows]
  );

  const columns = useMemo<Column<PartnerCustomer>[]>(
    () => [
      {
        key: "name",
        title: "Customer",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.name}</div>
            <div className="text-xs text-muted-foreground">Customer #{row.id}</div>
          </div>
        ),
      },
      {
        key: "phone",
        title: "Phone",
        render: (row) => row.phone || "—",
      },
      {
        key: "kyc_status",
        title: "KYC",
        sortable: true,
        render: (row) => <StatusBadge status={row.kyc_status || "NOT_PROVIDED"} />,
      },
      {
        key: "created_at",
        title: "Created",
        sortable: true,
        sortAccessor: (row) => Date.parse(row.created_at || "") || 0,
        render: (row) => formatDate(row.created_at),
      },
    ],
    []
  );

  return (
    <PortalPage
      title="Partner Customers"
      subtitle="Customers associated with your own partner subscriptions, with search and KYC visibility aligned to the refined shared workflow pattern."
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Customers" },
      ]}
      actions={[
        {
          href: "/partner/subscriptions",
          label: "Subscriptions",
          variant: "secondary",
        },
        {
          href: "/partner/collections",
          label: "Collections",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Matching Customers", value: count },
        { label: "Page Pending KYC", value: pagePendingKyc, tone: pagePendingKyc > 0 ? "warning" : undefined },
        { label: "Page Verified KYC", value: pageVerifiedKyc, tone: "success" },
        { label: "Search", value: q || "All" },
      ]}
      statusBadge={{ label: "Partner Customer Scope", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Matching Customers" value={count} icon={<Users className="h-4 w-4" />} />
          <StatCard
            label="Page Pending KYC"
            value={pagePendingKyc}
            icon={<ShieldCheck className="h-4 w-4" />}
            tone={pagePendingKyc > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Page Verified KYC"
            value={pageVerifiedKyc}
            icon={<ShieldCheck className="h-4 w-4" />}
            tone="success"
          />
          <StatCard label="Current Search" value={q || "All"} />
        </div>

        <WorkspaceSection
          title="Customer workflow"
          description="Search by customer name or phone, then narrow the visible list by KYC state without exposing admin-only customer controls."
          action={
            <button
              type="button"
              onClick={() => void loadCustomers("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          }
        >
          <TableToolbar
            footer={
              q || kycStatus ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-[0.14em]">Active filters</span>
                  {q ? <StatusBadge status="OPEN" label={`Search: ${q}`} hideIcon /> : null}
                  {kycStatus ? <StatusBadge status={kycStatus} hideIcon /> : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Partner scope remains read-only here. Use this page to route into partner-visible detail, subscriptions, and payment collection follow-up.
                </div>
              )
            }
          >
            <form
              onSubmit={handleApplyFilters}
              className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_auto]"
            >
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search name or phone"
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                />
              </label>

              <select
                value={kycInput}
                onChange={(event) => setKycInput(event.target.value as KycFilter)}
                className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All KYC</option>
                <option value="NOT_PROVIDED">Not Provided</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="VERIFIED">Verified</option>
                <option value="REJECTED">Rejected</option>
              </select>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Reset
                </button>
              </div>
            </form>
          </TableToolbar>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading customers..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Failed to load customers"
            description={error}
            onRetry={() => void loadCustomers("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <WorkspaceSection
            title="Customer rows"
            description="Open customer detail for partner-visible subscription and recent payment context."
          >
            {count === 0 ? (
              <EmptyState
                title="No customers found"
                description={
                  q || kycStatus
                    ? "No partner-scoped customers matched the current filters."
                    : "No customers are currently linked to this partner account."
                }
              />
            ) : rows.length === 0 ? (
              <EmptyState
                title="No rows on this page"
                description="The current page has no results. Move to a previous page or change the filters."
              />
            ) : (
              <DataTable<PartnerCustomer>
                rows={rows}
                columns={columns}
                onRowClick={(row) => router.push(`/partner/customers/${row.id}`)}
                rowActions={(row) => (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/partner/customers/${row.id}`}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    >
                      View Detail
                    </Link>
                    <Link
                      href={`/partner/subscriptions?customer=${row.id}`}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    >
                      Subscriptions
                    </Link>
                  </div>
                )}
              />
            )}

            {count > 0 ? (
              <PaginationControls
                count={count}
                page={page}
                pageSize={PAGE_SIZE}
                numPages={numPages}
                hasNext={hasNext}
                hasPrevious={hasPrevious}
                disabled={loading || refreshing}
                onPrevious={() => replacePage(Math.max(page - 1, 1))}
                onNext={() => replacePage(page + 1)}
              />
            ) : null}
          </WorkspaceSection>
        ) : null}
      </div>
    </PortalPage>
  );
}
