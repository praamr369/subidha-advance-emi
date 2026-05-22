"use client";

import type { ReactNode } from "react";

import EntityLookupCombobox from "@/components/erp/forms/EntityLookupCombobox";
import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";
import {
  lookupSettlementFinanceAccounts,
  primeSettlementLookupResolveCache,
  resolveSettlementFinanceAccountById,
} from "@/services/settlement-lookups";
import { useSettlementLookupPreview } from "./useSettlementLookupPreview";

type SettlementFinanceAccountLookupProps = {
  label: string;
  value: string | null;
  onChange: (value: string | null, option?: EntityLookupOption) => void;
  kind?: "BANK" | "UPI" | "CASH";
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  help?: ReactNode;
  error?: string | null;
  minChars?: number;
  placeholder?: string;
  className?: string;
};

export default function SettlementFinanceAccountLookup({
  label,
  value,
  onChange,
  kind,
  disabled,
  readOnly,
  required,
  help,
  error,
  minChars,
  placeholder,
  className,
}: SettlementFinanceAccountLookupProps) {
  const { selected, resolveError, clearError } = useSettlementLookupPreview(
    value,
    resolveSettlementFinanceAccountById
  );

  return (
    <div className="space-y-2">
      <EntityLookupCombobox
        label={label}
        value={value}
        onChange={(next, option) => {
          if (option && next) {
            primeSettlementLookupResolveCache("finance_account", next, option);
          }
          clearError();
          onChange(next, option);
        }}
        search={(query) => lookupSettlementFinanceAccounts({ query, kind })}
        placeholder={placeholder ?? "Search finance accounts..."}
        minChars={minChars}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        help={help}
        error={error}
        className={className}
        loadingText="Searching finance accounts..."
        emptyText="No finance accounts found"
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
        </div>
      ) : null}
    </div>
  );
}
