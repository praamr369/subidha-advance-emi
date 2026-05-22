"use client";

import type { ReactNode } from "react";

import EntityLookupCombobox from "@/components/erp/forms/EntityLookupCombobox";
import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";
import { lookupSettlementPayments } from "@/services/settlement-lookups";

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
  return (
    <EntityLookupCombobox
      label={label}
      value={value}
      onChange={onChange}
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
  );
}

