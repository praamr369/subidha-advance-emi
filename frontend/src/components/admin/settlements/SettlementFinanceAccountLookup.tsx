"use client";

import type { ReactNode } from "react";

import EntityLookupCombobox from "@/components/erp/forms/EntityLookupCombobox";
import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";
import { lookupSettlementFinanceAccounts } from "@/services/settlement-lookups";

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
  return (
    <EntityLookupCombobox
      label={label}
      value={value}
      onChange={onChange}
      search={(query) => lookupSettlementFinanceAccounts({ query, kind, isActive: true })}
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
  );
}

