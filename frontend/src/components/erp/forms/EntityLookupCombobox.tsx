"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import SearchSelect from "@/components/ui/SearchSelect";
import { cn } from "@/lib/utils";

export type EntityLookupOption = {
  id: number | string;
  label: string;
  subtitle?: string;
  code?: string;
  status?: string;
  metadata?: Record<string, unknown>;
};

type EntityLookupComboboxProps = {
  label: string;
  value: string | null;
  onChange: (value: string | null, option?: EntityLookupOption) => void;
  search: (query: string) => Promise<EntityLookupOption[]>;
  placeholder?: string;
  minChars?: number;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  help?: ReactNode;
  error?: string | null;
  loadingText?: string;
  emptyText?: string;
  className?: string;
};

function formatOption(option: EntityLookupOption): string {
  const suffix = option.code ? ` (${option.code})` : "";
  const subtitle = option.subtitle ? ` — ${option.subtitle}` : "";
  return `${option.label}${suffix}${subtitle}`;
}

export default function EntityLookupCombobox({
  label,
  value,
  onChange,
  search,
  placeholder,
  minChars,
  disabled,
  readOnly,
  required,
  help,
  error,
  loadingText,
  emptyText,
  className,
}: EntityLookupComboboxProps) {
  const effectiveDisabled = Boolean(disabled || readOnly);

  const resolvedLabel = useMemo(() => (required ? `${label} *` : label), [label, required]);

  return (
    <div className={cn("space-y-2", className)}>
      <SearchSelect<EntityLookupOption>
        value={value}
        onChange={(next, option) => onChange(next, option)}
        searchFn={search}
        getOptionValue={(item) => String(item.id)}
        getOptionLabel={formatOption}
        label={resolvedLabel}
        placeholder={placeholder}
        minChars={minChars}
        disabled={effectiveDisabled}
        loadingText={loadingText}
        emptyText={emptyText}
      />
      {help ? <div className="text-xs text-muted-foreground">{help}</div> : null}
      {error ? <div className="text-xs font-medium text-destructive">{error}</div> : null}
      <div className="text-[11px] text-muted-foreground">
        Selected value is saved as the numeric ID expected by the backend.
      </div>
    </div>
  );
}

