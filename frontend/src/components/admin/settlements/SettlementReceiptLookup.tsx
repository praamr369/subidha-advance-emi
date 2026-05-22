"use client";

import type { ReactNode } from "react";

import EntityLookupCombobox from "@/components/erp/forms/EntityLookupCombobox";
import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";
import { lookupSettlementReceipts } from "@/services/settlement-lookups";

type SettlementReceiptLookupProps = {
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

export default function SettlementReceiptLookup({
  label = "Receipt document",
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
}: SettlementReceiptLookupProps) {
  return (
    <EntityLookupCombobox
      label={label}
      value={value}
      onChange={onChange}
      search={lookupSettlementReceipts}
      placeholder={placeholder ?? "Search receipts by receipt no, customer..."}
      minChars={minChars ?? 2}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      help={help}
      error={error}
      className={className}
      loadingText="Searching receipts..."
      emptyText="No receipts found"
    />
  );
}

