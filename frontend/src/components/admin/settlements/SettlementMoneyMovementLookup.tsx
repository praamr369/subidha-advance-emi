"use client";

import type { ReactNode } from "react";

import EntityLookupCombobox from "@/components/erp/forms/EntityLookupCombobox";
import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";
import { lookupSettlementMoneyMovements } from "@/services/settlement-lookups";

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
  return (
    <EntityLookupCombobox
      label={label}
      value={value}
      onChange={onChange}
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
  );
}

