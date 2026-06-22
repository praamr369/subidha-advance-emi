import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/shared/tables/DataGrid";
import { DateCell } from "@/shared/ui/DateCell";
import { MoneyCell } from "@/shared/ui/MoneyCell";
import { KycBadge, ActiveBadge } from "./CustomerStatusBadge";
import type { CustomerAdmin } from "../api/customer.types";

const col = createColumnHelper<CustomerAdmin>();

function makeColumns(onSelect: (c: CustomerAdmin) => void) {
  return [
    col.accessor("name", {
      header: "Name",
      cell: (info) => (
        <button
          onClick={() => onSelect(info.row.original)}
          className="font-medium text-brand-700 hover:underline"
        >
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("phone", { header: "Phone" }),
    col.accessor("email", {
      header: "Email",
      cell: (info) => (
        <span className="text-stone-500">{info.getValue() || "—"}</span>
      ),
    }),
    col.accessor("customer_code", {
      header: "Code",
      cell: (info) => (
        <span className="font-mono text-xs text-stone-500">
          {info.getValue() || "—"}
        </span>
      ),
    }),
    col.accessor("kyc_status", {
      header: "KYC",
      cell: (info) => <KycBadge status={info.getValue()} />,
    }),
    col.accessor("status", {
      header: "Status",
      cell: (info) => <ActiveBadge status={info.getValue()} />,
    }),
    col.accessor("active_subscription_count", {
      header: "Subscriptions",
      cell: (info) => info.getValue(),
    }),
    col.accessor("active_subscription_due", {
      header: "Due",
      cell: (info) => <MoneyCell amount={Number(info.getValue())} />,
    }),
    col.accessor("created_at", {
      header: "Created",
      cell: (info) => <DateCell date={info.getValue()} />,
    }),
  ] as ColumnDef<CustomerAdmin, unknown>[];
}

type Props = {
  data: CustomerAdmin[];
  isLoading: boolean;
  onSelect: (customer: CustomerAdmin) => void;
};

export function CustomerTable({ data, isLoading, onSelect }: Props) {
  return (
    <DataGrid
      data={data}
      columns={makeColumns(onSelect)}
      isLoading={isLoading}
    />
  );
}
