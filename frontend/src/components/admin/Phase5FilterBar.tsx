"use client";

import { useMemo } from "react";

type FilterState = Record<string, string>;

export default function Phase5FilterBar({
  value,
  onChange,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const fields = useMemo(
    () => [
      { key: "date_from", label: "Date from", type: "date" },
      { key: "date_to", label: "Date to", type: "date" },
      { key: "contract_type", label: "Contract type", type: "text", placeholder: "EMI/RENT/LEASE/DIRECT_SALE" },
      { key: "payment_method", label: "Payment method", type: "text", placeholder: "CASH/UPI/BANK" },
      { key: "status", label: "Status", type: "text" },
      { key: "partner_id", label: "Partner ID", type: "number" },
      { key: "product_id", label: "Product ID", type: "number" },
      { key: "customer_id", label: "Customer ID", type: "number" },
      { key: "branch_id", label: "Branch ID", type: "number" },
      { key: "overdue_only", label: "Overdue only", type: "text", placeholder: "true/false" },
      { key: "unreconciled_only", label: "Unreconciled only", type: "text", placeholder: "true/false" },
    ],
    []
  );

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {fields.map((field) => (
        <label key={field.key} className="space-y-1 text-xs">
          <span className="font-medium text-foreground">{field.label}</span>
          <input
            type={field.type}
            value={value[field.key] ?? ""}
            placeholder={field.placeholder}
            onChange={(e) => onChange({ ...value, [field.key]: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
      ))}
    </div>
  );
}

