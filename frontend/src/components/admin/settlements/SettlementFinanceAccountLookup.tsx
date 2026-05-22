"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import EntityLookupCombobox from "@/components/erp/forms/EntityLookupCombobox";
import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";
import { ApiError } from "@/lib/api";
import {
  lookupSettlementFinanceAccounts,
  primeSettlementLookupResolveCache,
  resolveSettlementFinanceAccountById,
} from "@/services/settlement-lookups";

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
  const [selected, setSelected] = useState<EntityLookupOption | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (!value) {
        setSelected(null);
        setResolveError(null);
        return;
      }
      if (selected && String(selected.id) === String(value)) return;
      if (!/^\d+$/.test(String(value))) {
        setResolveError(null);
        return;
      }

      try {
        const option = await resolveSettlementFinanceAccountById(value);
        if (cancelled) return;
        setSelected(option);
        setResolveError(null);
      } catch (error) {
        if (cancelled) return;
        setSelected(null);

        const status =
          error instanceof ApiError
            ? error.status
            : typeof error === "object" &&
                error !== null &&
                "status" in error &&
                typeof (error as { status?: unknown }).status === "number"
              ? (error as { status: number }).status
              : undefined;

        if (status === 404) {
          setResolveError("Selected record was not found.");
        } else if (status === 403) {
          setResolveError("You are not allowed to view this record.");
        } else {
          setResolveError("Could not load selected record preview.");
        }
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [value, selected]);

  return (
    <div className="space-y-2">
      <EntityLookupCombobox
        label={label}
        value={value}
        onChange={(next, option) => {
          setSelected(option ?? null);
          if (option && next) {
            primeSettlementLookupResolveCache("finance_account", next, option);
          }
          setResolveError(null);
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
