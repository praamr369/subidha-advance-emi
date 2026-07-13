"use client";
import { type PimCategoryAttribute, type PimProductAttribute } from "@/services/pim";

interface AttributeValues {
  [attributeId: number]: {
    value_text: string;
    value_number: string;
    value_boolean: boolean | null;
    value_date: string;
  };
}

interface Props {
  attributes: PimCategoryAttribute[];
  values: AttributeValues;
  onChange: (updated: AttributeValues) => void;
  existingAttributes?: PimProductAttribute[];
}

export type { AttributeValues };

export default function DynamicAttributeForm({ attributes, values, onChange, existingAttributes }: Props) {
  const update = (attrId: number, field: string, value: string | boolean | null) => {
    const current = values[attrId] ?? { value_text: "", value_number: "", value_boolean: null, value_date: "" };
    onChange({
      ...values,
      [attrId]: { ...current, [field]: value },
    });
  };

  if (attributes.length === 0) {
    return <p className="text-sm text-muted-foreground">No attributes defined for this category/subcategory.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {attributes.map((attr) => {
        const existing = existingAttributes?.find((a) => a.attribute === attr.id);
        const val = values[attr.id] ?? {
          value_text: existing?.value_text ?? "",
          value_number: existing?.value_number ?? "",
          value_boolean: existing?.value_boolean ?? null,
          value_date: existing?.value_date ?? "",
        };

        return (
          <div key={attr.id} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              {attr.name}
              {attr.is_required && <span className="text-destructive ml-1">*</span>}
              {attr.is_variant_defining && (
                <span className="ml-2 text-xs text-primary font-normal">(Variant)</span>
              )}
            </label>

            {attr.data_type === "CHOICE" && (
              <select
                className="rounded-md border px-3 py-2 text-sm bg-background"
                value={val.value_text}
                onChange={(e) => update(attr.id, "value_text", e.target.value)}
              >
                <option value="">— Select —</option>
                {attr.options.map((opt) => (
                  <option key={opt.id} value={opt.value}>{opt.display_name}</option>
                ))}
              </select>
            )}

            {attr.data_type === "MULTI_CHOICE" && (
              <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {attr.options.map((opt) => {
                  const selected = val.value_text.split(",").includes(opt.value);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        const current = val.value_text ? val.value_text.split(",") : [];
                        const next = selected
                          ? current.filter((v) => v !== opt.value)
                          : [...current, opt.value];
                        update(attr.id, "value_text", next.join(","));
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      {opt.display_name}
                    </button>
                  );
                })}
              </div>
            )}

            {attr.data_type === "TEXT" && (
              <input
                type="text"
                className="rounded-md border px-3 py-2 text-sm bg-background"
                value={val.value_text}
                placeholder={`Enter ${attr.name}`}
                onChange={(e) => update(attr.id, "value_text", e.target.value)}
              />
            )}

            {attr.data_type === "NUMBER" && (
              <input
                type="number"
                className="rounded-md border px-3 py-2 text-sm bg-background"
                value={val.value_number}
                placeholder="0"
                min={attr.min_value ?? undefined}
                max={attr.max_value ?? undefined}
                onChange={(e) => update(attr.id, "value_number", e.target.value)}
              />
            )}

            {attr.data_type === "DECIMAL" && (
              <input
                type="number"
                step="0.01"
                className="rounded-md border px-3 py-2 text-sm bg-background"
                value={val.value_number}
                placeholder="0.00"
                min={attr.min_value ?? undefined}
                max={attr.max_value ?? undefined}
                onChange={(e) => update(attr.id, "value_number", e.target.value)}
              />
            )}

            {attr.data_type === "BOOLEAN" && (
              <div className="flex gap-4 pt-1">
                {[
                  { label: "Yes", value: true },
                  { label: "No", value: false },
                ].map(({ label, value }) => (
                  <label key={label} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`bool-${attr.id}`}
                      checked={val.value_boolean === value}
                      onChange={() => update(attr.id, "value_boolean", value)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            )}

            {attr.data_type === "DATE" && (
              <input
                type="date"
                className="rounded-md border px-3 py-2 text-sm bg-background"
                value={val.value_date}
                onChange={(e) => update(attr.id, "value_date", e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
