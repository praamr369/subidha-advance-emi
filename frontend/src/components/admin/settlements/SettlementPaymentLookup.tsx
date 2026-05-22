"use client";

import type { ReactNode } from "react";

import EntityLookupCombobox from "@/components/erp/forms/EntityLookupCombobox";
import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";
import {
  lookupSettlementPayments,
  primeSettlementLookupResolveCache,
  resolveSettlementPaymentById,
} from "@/services/settlement-lookups";
import { useSettlementLookupPreview } from "./useSettlementLookupPreview";

type SettlementPaymentLookupProps = {
  label?: string;
  value: string | null;
  onChange: (value: string | null, option?: EntityLookupOption) => void;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  help?: ReactNode;
  error?: string | null;
  minChars?: number;
  placeholder?: string;
  className?: string;
};

export default function SettlementPaymentLookup({
  label = "Payment",
  value,
  onChange,
  disabled,
  readOnly,
  required,
  help,
  error,
  minChars,
  placeholder,
  className,
}: SettlementPaymentLookupProps) {
  const { selected, resolveError, clearError } = useSettlementLookupPreview(
    value,
    resolveSettlementPaymentById
  );
  const selectedMeta = selected?.metadata ?? {};

  return (
    <div className="space-y-2">
      <EntityLookupCombobox
        label={label}
        value={value}
        onChange={(next, option) => {
          if (option && next) {
            primeSettlementLookupResolveCache("payment", next, option);
          }
          clearError();
          onChange(next, option);
        }}
        search={lookupSettlementPayments}
        placeholder={placeholder ?? "Search payments by ID, reference, customer, subscription..."}
        minChars={minChars ?? 2}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        help={help}
        error={error}
        className={className}
        loadingText="Searching payments..."
        emptyText="No payments found"
      />
      {!selected && resolveError && value && /^\d+$/.test(String(value)) ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">{resolveError}</div>
            <button
              type="button"
              className="text-destructive underline underline-offset-2 hover:opacity-90"
              onClick={() => void navigator.clipboard?.writeText(String(value))}
            >
              Copy ID
            </button>
          </div>
          <div>ID: {String(value)}</div>
        </div>
      ) : null}
      {selected ? (
        <div className="rounded-md border bg-muted/20 p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">{selected.label}</div>
            <button
              type="button"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => void navigator.clipboard?.writeText(String(selected.id))}
            >
              Copy ID
            </button>
          </div>
          <div className="text-muted-foreground">ID: {String(selected.id)}</div>
          {selected.subtitle ? <div className="text-muted-foreground">{selected.subtitle}</div> : null}
          {"amount" in selectedMeta && selectedMeta.amount ? (
            <div className="text-muted-foreground">Amount: ₹{String(selectedMeta.amount)}</div>
          ) : null}
          {"date" in selectedMeta && selectedMeta.date ? (
            <div className="text-muted-foreground">Date: {String(selectedMeta.date)}</div>
          ) : null}
          {"is_reversed" in selectedMeta && selectedMeta.is_reversed ? (
            <div className="text-muted-foreground">Status: REVERSED</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
