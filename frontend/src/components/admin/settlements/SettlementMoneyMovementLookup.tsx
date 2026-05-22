"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import EntityLookupCombobox from "@/components/erp/forms/EntityLookupCombobox";
import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";
import { lookupSettlementMoneyMovements, resolveSettlementMoneyMovementById } from "@/services/settlement-lookups";

type SettlementMoneyMovementLookupProps = {
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

export default function SettlementMoneyMovementLookup({
  label = "Money movement",
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
}: SettlementMoneyMovementLookupProps) {
  const [selected, setSelected] = useState<EntityLookupOption | null>(null);
  const selectedMeta = selected?.metadata ?? {};

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (!value) {
        setSelected(null);
        return;
      }
      if (selected && String(selected.id) === String(value)) return;
      if (!/^\d+$/.test(String(value))) return;

      try {
        const option = await resolveSettlementMoneyMovementById(value);
        if (!cancelled) setSelected(option);
      } catch {
        if (!cancelled) setSelected(null);
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
          onChange(next, option);
        }}
        search={lookupSettlementMoneyMovements}
        placeholder={placeholder ?? "Search movements by movement no, reference..."}
        minChars={minChars ?? 2}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        help={help}
        error={error}
        className={className}
        loadingText="Searching money movements..."
        emptyText="No money movements found"
      />
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
          {selected.status ? <div className="text-muted-foreground">Status: {selected.status}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
