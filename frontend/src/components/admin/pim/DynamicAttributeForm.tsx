"use client";
import { Lock, Unlock, Layers, X } from "lucide-react";
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
  /** Attribute IDs the operator has manually locked */
  lockedAttributes?: Set<number>;
  /** Called when operator clicks the lock/unlock toggle */
  onToggleLock?: (attributeId: number) => void;
  /** Called when operator removes an attribute from this product */
  onRemove?: (attributeId: number) => void;
}

export type { AttributeValues };

function getDisplayValue(attr: PimCategoryAttribute, val: AttributeValues[number]): string {
  if (attr.data_type === "CHOICE") {
    return attr.options.find((o) => o.value === val.value_text)?.display_name ?? val.value_text;
  }
  if (attr.data_type === "BOOLEAN") {
    return val.value_boolean === true ? "Yes" : val.value_boolean === false ? "No" : "—";
  }
  return String(val.value_number || val.value_text || val.value_date || "—");
}

function AttributeLockButton({
  isLocked,
  isVariantDefining,
  onToggle,
}: {
  isLocked: boolean;
  isVariantDefining: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={isLocked ? "Click to unlock this attribute" : "Click to lock this attribute"}
      onClick={onToggle}
      className={`ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        isLocked
          ? isVariantDefining
            ? "bg-primary/10 text-primary hover:bg-primary/20"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      {isLocked ? (
        <><Lock className="h-2.5 w-2.5" />{isVariantDefining ? "Variant key" : "Locked"}</>
      ) : (
        <><Unlock className="h-2.5 w-2.5" />Unlocked</>
      )}
    </button>
  );
}

export default function DynamicAttributeForm({
  attributes,
  values,
  onChange,
  existingAttributes,
  lockedAttributes,
  onToggleLock,
  onRemove,
}: Props) {
  const update = (attrId: number, field: string, value: string | boolean | null) => {
    const current = values[attrId] ?? { value_text: "", value_number: "", value_boolean: null, value_date: "" };
    onChange({ ...values, [attrId]: { ...current, [field]: value } });
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

        // Determine lock state:
        // - If operator has manually locked: locked
        // - If operator has explicitly NOT locked a variant-defining attr: unlocked (overrides default)
        // - Default for variant-defining with existing value: locked
        const operatorLocked = lockedAttributes?.has(attr.id) ?? false;
        const autoLocked = attr.is_variant_defining && Boolean(existing) && !lockedAttributes;
        const isLocked = operatorLocked || autoLocked;

        const canToggle = Boolean(onToggleLock);

        if (isLocked) {
          const displayVal = getDisplayValue(attr, val);
          return (
            <div key={attr.id} className="flex flex-col gap-1.5">
              <label className="text-sm font-medium flex items-center gap-1 flex-wrap">
                <span>{attr.name}</span>
                {attr.is_variant_defining && (
                  <Layers className="h-3 w-3 text-primary shrink-0" />
                )}
                {canToggle && (
                  <AttributeLockButton
                    isLocked
                    isVariantDefining={attr.is_variant_defining}
                    onToggle={() => onToggleLock!(attr.id)}
                  />
                )}
                {onRemove && (
                  <button
                    type="button"
                    title="Remove this attribute from product"
                    onClick={() => onRemove(attr.id)}
                    className="ml-auto rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </label>
              <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground">{displayVal}</span>
              </div>
            </div>
          );
        }

        return (
          <div key={attr.id} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium flex items-center gap-1 flex-wrap">
              <span>{attr.name}</span>
              {attr.is_required && <span className="text-destructive">*</span>}
              {attr.is_variant_defining && (
                <Layers className="h-3 w-3 text-primary shrink-0" />
              )}
              {canToggle && (
                <AttributeLockButton
                  isLocked={false}
                  isVariantDefining={attr.is_variant_defining}
                  onToggle={() => onToggleLock!(attr.id)}
                />
              )}
              {onRemove && (
                <button
                  type="button"
                  title="Remove this attribute from product"
                  onClick={() => onRemove(attr.id)}
                  className="ml-auto rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </label>

            {attr.data_type === "CHOICE" && (
              <select
                className="rounded-md border px-3 py-2 text-sm bg-background"
                value={val.value_text}
                onChange={(e) => update(attr.id, "value_text", e.target.value)}
              >
                <option value="">— Select —</option>
                {attr.options.map((opt) => {
                  const cost = Number(opt.extra_cost ?? 0);
                  const label = cost > 0
                    ? `${opt.display_name}  (+₹${cost.toLocaleString("en-IN")})`
                    : opt.display_name;
                  return (
                    <option key={opt.id} value={opt.value}>{label}</option>
                  );
                })}
              </select>
            )}

            {attr.data_type === "MULTI_CHOICE" && (
              <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {attr.options.map((opt) => {
                  const selected = val.value_text.split(",").includes(opt.value);
                  const cost = Number(opt.extra_cost ?? 0);
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
                      className={`flex flex-col items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      <span>{opt.display_name}</span>
                      {cost > 0 && (
                        <span className={`text-[10px] font-semibold ${selected ? "text-primary-foreground/80" : "text-amber-600 dark:text-amber-400"}`}>
                          +₹{cost.toLocaleString("en-IN")}
                        </span>
                      )}
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
