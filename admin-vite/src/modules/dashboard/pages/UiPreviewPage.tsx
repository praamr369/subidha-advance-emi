import { PageHeader } from "@/shared/ui/PageHeader";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { MoneyCell } from "@/shared/ui/MoneyCell";
import { DateCell } from "@/shared/ui/DateCell";
import { EmptyState } from "@/shared/ui/EmptyState";
import { ErrorState } from "@/shared/ui/ErrorState";
import { LoadingState } from "@/shared/ui/LoadingState";
import { SearchInput } from "@/shared/filters/SearchInput";
import { FilterBar } from "@/shared/filters/FilterBar";
import { DataGrid } from "@/shared/tables/DataGrid";
import { PaginationBar } from "@/shared/tables/PaginationBar";
import { type ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

type SampleRow = {
  id: number;
  name: string;
  status: string;
  amount: number;
  date: string;
};

const sampleData: SampleRow[] = [
  { id: 1, name: "Ram Sharma", status: "Active", amount: 15000, date: "2025-06-15" },
  { id: 2, name: "Sita Devi", status: "Pending", amount: 25000, date: "2025-06-10" },
  { id: 3, name: "Hari Bahadur", status: "Overdue", amount: 8500, date: "2025-05-20" },
];

const columns: ColumnDef<SampleRow, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Customer" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const v = getValue() as string;
      const variant =
        v === "Active" ? "success" : v === "Pending" ? "warning" : "danger";
      return <StatusBadge label={v} variant={variant} />;
    },
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ getValue }) => <MoneyCell amount={getValue() as number} />,
  },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ getValue }) => <DateCell date={getValue() as string} />,
  },
];

export function UiPreviewPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  return (
    <div className="space-y-10">
      <PageHeader
        title="UI Component Preview"
        description="Shared enterprise components for admin-vite"
        actions={
          <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
            Sample Action
          </button>
        }
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-stone-700">
          Status Badges
        </h2>
        <div className="flex gap-3">
          <StatusBadge label="Active" variant="success" />
          <StatusBadge label="Pending" variant="warning" />
          <StatusBadge label="Overdue" variant="danger" />
          <StatusBadge label="Processing" variant="info" />
          <StatusBadge label="Draft" variant="neutral" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-stone-700">
          Money &amp; Date Cells
        </h2>
        <div className="flex gap-6">
          <div>
            <span className="text-sm text-stone-500">Amount: </span>
            <MoneyCell amount={125000} />
          </div>
          <div>
            <span className="text-sm text-stone-500">Date: </span>
            <DateCell date="2025-06-15" format="long" />
          </div>
          <div>
            <span className="text-sm text-stone-500">Relative: </span>
            <DateCell date={new Date().toISOString()} format="relative" />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-stone-700">
          Filter Bar + Search
        </h2>
        <FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search customers..."
          />
        </FilterBar>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-stone-700">DataGrid</h2>
        <DataGrid data={sampleData} columns={columns} />
        <PaginationBar
          page={page}
          pageSize={10}
          total={30}
          onPageChange={setPage}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-stone-700">States</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-stone-200 bg-white">
            <LoadingState />
          </div>
          <div className="rounded-lg border border-stone-200 bg-white">
            <EmptyState />
          </div>
          <div className="rounded-lg border border-stone-200 bg-white">
            <ErrorState onRetry={() => alert("retry")} />
          </div>
        </div>
      </section>
    </div>
  );
}
