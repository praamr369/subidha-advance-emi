import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { DataGrid } from "@/shared/tables/DataGrid";
import { MoneyCell } from "@/shared/ui/MoneyCell";
import { LifecycleBadge, ActiveBadge, InventoryBadge } from "./ProductStatusBadge";
import type { ProductAdmin } from "../api/product.types";

const col = createColumnHelper<ProductAdmin>();

function makeColumns(onSelect: (p: ProductAdmin) => void) {
  return [
    col.accessor("product_code", {
      header: "Code",
      cell: (info) => (
        <button
          onClick={() => onSelect(info.row.original)}
          className="font-mono text-xs font-medium text-brand-700 hover:underline"
        >
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("name", {
      header: "Name",
      cell: (info) => (
        <button
          onClick={() => onSelect(info.row.original)}
          className="font-medium text-stone-800 hover:underline"
        >
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("category_master_name", {
      header: "Category",
      cell: (info) => (
        <span className="text-stone-500">{info.getValue() || info.row.original.category || "—"}</span>
      ),
    }),
    col.accessor("base_price", {
      header: "Base Price",
      cell: (info) => <MoneyCell amount={Number(info.getValue())} />,
    }),
    col.accessor("lifecycle_status", {
      header: "Lifecycle",
      cell: (info) => <LifecycleBadge status={info.getValue()} />,
    }),
    col.accessor("is_active", {
      header: "Status",
      cell: (info) => <ActiveBadge isActive={info.getValue()} />,
    }),
    col.accessor("inventory_ready", {
      header: "Inventory",
      cell: (info) => <InventoryBadge ready={info.getValue()} />,
    }),
    col.accessor("plan_type_default", {
      header: "Plan",
      cell: (info) => (
        <span className="text-xs text-stone-500">{info.getValue()}</span>
      ),
    }),
  ] as ColumnDef<ProductAdmin, unknown>[];
}

type Props = {
  data: ProductAdmin[];
  isLoading: boolean;
  onSelect: (product: ProductAdmin) => void;
};

export function ProductTable({ data, isLoading, onSelect }: Props) {
  return (
    <DataGrid data={data} columns={makeColumns(onSelect)} isLoading={isLoading} />
  );
}
