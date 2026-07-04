"use client";

import { amendmentFieldsFor } from "@/services/amendment-fields";
import type { AmendmentType } from "@/services/amendments";

type Props = {
  amendmentType: AmendmentType;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
};

export default function AmendmentValueFields({ amendmentType, values, onChange }: Props) {
  const fields = amendmentFieldsFor(amendmentType);
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {fields.map((field) => (
        <label key={field.key} className={`text-sm font-medium ${field.type === "textarea" ? "md:col-span-2" : ""}`}>
          {field.label}
          {field.type === "textarea" ? (
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm"
              value={values[field.key] ?? ""}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
            />
          ) : (
            <input
              type={field.type === "number" ? "number" : field.type === "tel" ? "tel" : "text"}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={values[field.key] ?? ""}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
            />
          )}
          {field.help ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{field.help}</span> : null}
        </label>
      ))}
    </div>
  );
}
