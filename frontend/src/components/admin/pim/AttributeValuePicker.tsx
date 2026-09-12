"use client";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { type PimAttributeOption, type PimCategoryAttribute } from "@/services/pim";
import { templateValuesFor } from "./DynamicAttributeForm";

const ADD_NEW = "__pim_add_new__";
const TEMPLATE_PREFIX = "__pim_template__:";

interface Props {
  attr: PimCategoryAttribute;
  value: string;
  onChange: (value: string) => void;
  /** Saves a value (preset) on the attribute; resolves with the saved option. Enables quick-add. */
  onAddOption?: (attr: PimCategoryAttribute, value: string) => Promise<PimAttributeOption>;
  /** Every attribute in the catalogue — same-named attributes' values are offered as templates. */
  templateAttributes?: PimCategoryAttribute[];
  className?: string;
}

/**
 * One attribute value field that stores a plain string (used by the SKU add/edit
 * forms). A CHOICE attribute gets a dropdown with "+ Add new value…" and values
 * from same-named attributes in other categories; any other type gets free entry
 * with those values as suggestions plus "Save as preset".
 */
export default function AttributeValuePicker({
  attr,
  value,
  onChange,
  onAddOption,
  templateAttributes,
  className = "mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-sm",
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const templates = templateValuesFor(attr, templateAttributes);

  const save = async (raw: string) => {
    const next = raw.trim();
    if (!next || !onAddOption) return;
    setBusy(true);
    setError("");
    try {
      const option = await onAddOption(attr, next);
      onChange(option.value);
      setAdding(false);
      setDraft("");
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? "Could not add value.");
    } finally {
      setBusy(false);
    }
  };

  const errorText = error ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null;

  if (attr.data_type === "CHOICE") {
    return (
      <>
        <select
          aria-label={attr.name}
          className={`${className} disabled:opacity-60`}
          value={value}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.value;
            if (next === ADD_NEW) {
              setAdding(true);
              setDraft("");
            } else if (next.startsWith(TEMPLATE_PREFIX)) {
              void save(next.slice(TEMPLATE_PREFIX.length));
            } else {
              onChange(next);
            }
          }}
        >
          <option value="">{attr.options.length > 0 ? "— Select —" : "— No values yet —"}</option>
          {attr.options.map((opt) => {
            const cost = Number(opt.extra_cost ?? 0);
            const label = cost > 0 ? `${opt.display_name}  (+₹${cost.toLocaleString("en-IN")})` : opt.display_name;
            return <option key={opt.id} value={opt.value}>{label}</option>;
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
        {adding && (
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              autoFocus
              aria-label={`New ${attr.name} value`}
              className="min-w-0 flex-1 rounded-md border bg-background px-2.5 py-1 text-sm"
              placeholder={`New ${attr.name} value`}
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter would otherwise submit the surrounding product form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save(draft);
                }
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
            />
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => void save(draft)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        )}
        {errorText}
      </>
    );
  }

  // Free entry (text / number / multi-value): type anything, or pick a preset / template.
  const numeric = attr.data_type === "NUMBER" || attr.data_type === "DECIMAL";
  const presets = attr.options.map((o) => o.value);
  const suggestions = [...presets, ...templates];
  const listId = `pim-sku-attr-${attr.id}-presets`;
  const current = value.trim();
  const canSavePreset =
    Boolean(onAddOption) && current !== "" && !presets.some((p) => p.trim().toLowerCase() === current.toLowerCase());

  return (
    <>
      <div className="flex items-center gap-1.5">
        <input
          type={numeric ? "number" : "text"}
          step={attr.data_type === "DECIMAL" ? "0.01" : undefined}
          aria-label={attr.name}
          list={suggestions.length > 0 ? listId : undefined}
          className={`${className} min-w-0`}
          value={value}
          placeholder={suggestions.length > 0 ? `Type or pick ${attr.name}` : `Enter ${attr.name}`}
          onChange={(e) => onChange(e.target.value)}
        />
        {canSavePreset && (
          <button
            type="button"
            disabled={busy}
            title={`Keep "${current}" as a ${attr.name} preset`}
            onClick={() => void save(current)}
            className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Preset
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
