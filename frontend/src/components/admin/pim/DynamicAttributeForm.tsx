"use client";
import { useState } from "react";
import { Lock, Unlock, Layers, X, Plus, Loader2 } from "lucide-react";
import { type PimAttributeOption, type PimCategoryAttribute, type PimProductAttribute } from "@/services/pim";

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
  /** Saves a value (preset) on an attribute; resolves with the saved option. Enables quick-add. */
  onAddOption?: (attr: PimCategoryAttribute, value: string) => Promise<PimAttributeOption>;
  /** Every attribute in the catalogue — values of same-named attributes in other categories are offered as templates. */
  templateAttributes?: PimCategoryAttribute[];
}

export type { AttributeValues };

const ADD_NEW = "__pim_add_new__";
const TEMPLATE_PREFIX = "__pim_template__:";

// Attribute types whose saved values can be shared as templates. Text shares with
// choice types (a "Material" can be free text in one category and a dropdown in another).
const VALUE_FAMILY: Partial<Record<PimCategoryAttribute["data_type"], "word" | "number">> = {
  CHOICE: "word",
  MULTI_CHOICE: "word",
  TEXT: "word",
  NUMBER: "number",
  DECIMAL: "number",
};

function isNumeric(attr: PimCategoryAttribute): boolean {
  return attr.data_type === "NUMBER" || attr.data_type === "DECIMAL";
}

/** Values already saved on same-named attributes elsewhere, minus the ones this attribute has. */
export function templateValuesFor(attr: PimCategoryAttribute, templateAttributes: PimCategoryAttribute[] | undefined): string[] {
  const family = VALUE_FAMILY[attr.data_type];
  if (!family || !templateAttributes?.length) return [];
  const name = attr.name.trim().toLowerCase();
  const own = new Set(attr.options.map((o) => o.value.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const other of templateAttributes) {
    if (other.id === attr.id || VALUE_FAMILY[other.data_type] !== family) continue;
    if (other.slug !== attr.slug && other.name.trim().toLowerCase() !== name) continue;
    for (const opt of other.options) {
      const key = opt.value.trim().toLowerCase();
      if (!key || own.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(opt.value.trim());
    }
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

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
  onAddOption,
  templateAttributes,
}: Props) {
  // Quick-add state: which attribute's inline "new value" box is open, and per-attribute busy/errors.
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busyFor, setBusyFor] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const update = (attrId: number, field: string, value: string | boolean | null) => {
    const current = values[attrId] ?? { value_text: "", value_number: "", value_boolean: null, value_date: "" };
    onChange({ ...values, [attrId]: { ...current, [field]: value } });
  };

  /** Save a value on the attribute (reusing it if it exists) and put it in the field. */
  const addAndSelect = async (attr: PimCategoryAttribute, rawValue: string, currentText: string) => {
    const value = rawValue.trim();
    if (!value || !onAddOption) return;
    setBusyFor(attr.id);
    setErrors((prev) => ({ ...prev, [attr.id]: "" }));
    try {
      const option = await onAddOption(attr, value);
      if (attr.data_type === "MULTI_CHOICE") {
        const current = currentText ? currentText.split(",") : [];
        if (!current.includes(option.value)) update(attr.id, "value_text", [...current, option.value].join(","));
      } else {
        update(attr.id, isNumeric(attr) ? "value_number" : "value_text", option.value);
      }
      setAddingFor(null);
      setDraft("");
    } catch (err: unknown) {
      setErrors((prev) => ({ ...prev, [attr.id]: (err as { message?: string })?.message ?? "Could not add value." }));
    } finally {
      setBusyFor(null);
    }
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

        const templates = templateValuesFor(attr, templateAttributes);
        const busy = busyFor === attr.id;
        const quickAddOpen = addingFor === attr.id;

        const quickAddRow = quickAddOpen ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              aria-label={`New ${attr.name} value`}
              className="min-w-0 flex-1 rounded-md border px-3 py-1.5 text-sm bg-background"
              placeholder={`New ${attr.name} value`}
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter would otherwise submit the whole product form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addAndSelect(attr, draft, val.value_text);
                }
                if (e.key === "Escape") {
                  setAddingFor(null);
                  setDraft("");
                }
              }}
            />
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => void addAndSelect(attr, draft, val.value_text)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setAddingFor(null);
                setDraft("");
              }}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        ) : null;

        const errorText = errors[attr.id] ? (
          <p role="alert" className="text-xs text-destructive">{errors[attr.id]}</p>
        ) : null;

        // Free-entry fields (text / number): type anything, or pick a saved preset / template.
        let freeEntry: React.ReactNode = null;
        if (attr.data_type === "TEXT" || isNumeric(attr)) {
          const field = isNumeric(attr) ? "value_number" : "value_text";
          const current = String(val[field] ?? "").trim();
          const presets = attr.options.map((o) => o.value);
          const suggestions = [...presets, ...templates];
          const listId = `pim-attr-${attr.id}-presets`;
          const canSavePreset =
            Boolean(onAddOption) && current !== "" && !presets.some((p) => p.trim().toLowerCase() === current.toLowerCase());
          freeEntry = (
            <>
              <div className="flex items-center gap-2">
                <input
                  type={isNumeric(attr) ? "number" : "text"}
                  step={attr.data_type === "DECIMAL" ? "0.01" : undefined}
                  aria-label={attr.name}
                  list={suggestions.length > 0 ? listId : undefined}
                  className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm bg-background"
                  value={val[field]}
                  placeholder={
                    suggestions.length > 0
                      ? `Type or pick ${attr.name}`
                      : isNumeric(attr)
                        ? attr.data_type === "DECIMAL" ? "0.00" : "0"
                        : `Enter ${attr.name}`
                  }
                  min={isNumeric(attr) ? attr.min_value ?? undefined : undefined}
                  max={isNumeric(attr) ? attr.max_value ?? undefined : undefined}
                  onChange={(e) => update(attr.id, field, e.target.value)}
                />
                {canSavePreset && (
                  <button
                    type="button"
                    disabled={busy}
                    title={`Keep "${current}" as a ${attr.name} preset for other products`}
                    onClick={() => void addAndSelect(attr, current, val.value_text)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Save as preset
                  </button>
                )}
              </div>
              {suggestions.length > 0 && (
                <datalist id={listId}>
                  {suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
              {errorText}
            </>
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
              <>
                <select
                  aria-label={attr.name}
                  className="rounded-md border px-3 py-2 text-sm bg-background disabled:opacity-60"
                  value={val.value_text}
                  disabled={busy}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === ADD_NEW) {
                      setAddingFor(attr.id);
                      setDraft("");
                    } else if (next.startsWith(TEMPLATE_PREFIX)) {
                      void addAndSelect(attr, next.slice(TEMPLATE_PREFIX.length), val.value_text);
                    } else {
                      update(attr.id, "value_text", next);
                    }
                  }}
                >
                  <option value="">{attr.options.length > 0 ? "— Select —" : "— No values yet —"}</option>
                  {attr.options.map((opt) => {
                    const cost = Number(opt.extra_cost ?? 0);
                    const label = cost > 0
                      ? `${opt.display_name}  (+₹${cost.toLocaleString("en-IN")})`
                      : opt.display_name;
                    return (
                      <option key={opt.id} value={opt.value}>{label}</option>
                    );
                  })}
                  {onAddOption && templates.length > 0 && (
                    <optgroup label="From other categories (adds it here)">
                      {templates.map((t) => (
                        <option key={t} value={`${TEMPLATE_PREFIX}${t}`}>{t}</option>
                      ))}
                    </optgroup>
                  )}
                  {onAddOption && <option value={ADD_NEW}>+ Add new value…</option>}
                </select>
                {quickAddRow}
                {errorText}
              </>
            )}

            {attr.data_type === "MULTI_CHOICE" && (
              <>
                <div className="flex flex-wrap gap-2 rounded-md border p-2">
                  {attr.options.map((opt) => {
                    const selected = val.value_text.split(",").includes(opt.value);
                    const cost = Number(opt.extra_cost ?? 0);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={selected}
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
                  {onAddOption && templates.map((t) => (
                    <button
                      key={`tpl-${t}`}
                      type="button"
                      disabled={busy}
                      title="From another category — adds it to this attribute"
                      onClick={() => void addAndSelect(attr, t, val.value_text)}
                      className="inline-flex items-center gap-1 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" /> {t}
                    </button>
                  ))}
                  {onAddOption && !quickAddOpen && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAddingFor(attr.id);
                        setDraft("");
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" /> Add value
                    </button>
                  )}
                  {attr.options.length === 0 && templates.length === 0 && !onAddOption && (
                    <span className="px-1 py-1 text-xs text-muted-foreground">No values yet</span>
                  )}
                </div>
                {quickAddRow}
                {errorText}
              </>
            )}

            {freeEntry}

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
                aria-label={attr.name}
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
