"use client";

import { MapPin, Loader2, Check, AlertCircle } from "lucide-react";

import {
  usePincodeAutofill,
  type PincodeAutofillState,
} from "@/hooks/usePincodeAutofill";
import { confirmSuggestion, type PincodeOption } from "@/services/smart-fields";

type PincodeFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Invoked whenever a location is resolved/selected so the parent can fill fields. */
  onResolved: (option: PincodeOption) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
};

function statusHint(state: PincodeAutofillState): { text: string; tone: string } | null {
  switch (state.status) {
    case "loading":
      return { text: "Looking up location…", tone: "text-muted-foreground" };
    case "found":
      return {
        text: state.primary
          ? `Auto-filled: ${[state.primary.city, state.primary.district, state.primary.state]
              .filter(Boolean)
              .join(", ")}`
          : "Location found",
        tone: "text-emerald-600",
      };
    case "multiple":
      return { text: "Multiple locations — pick one below", tone: "text-amber-600" };
    case "not_found":
      return { text: "No match found — enter location manually", tone: "text-muted-foreground" };
    case "error":
      return { text: "Lookup failed — enter location manually", tone: "text-destructive" };
    default:
      return null;
  }
}

/**
 * Pincode input wired to the offline pincode->location service. On a valid 6-digit
 * pincode it auto-fills the bound city/district/state via `onResolved`, and offers a
 * chooser when several locations share the pincode. Selections are also recorded so
 * coverage improves over time.
 */
export default function PincodeField({
  id,
  label,
  value,
  onChange,
  onResolved,
  placeholder = "6-digit PIN code",
  disabled = false,
  required = false,
  error,
}: PincodeFieldProps) {
  const state = usePincodeAutofill(value, onResolved);
  const hint = statusHint(state);

  function selectOption(option: PincodeOption) {
    onResolved(option);
    void confirmSuggestion({
      fieldKey: "pincode",
      input: value.trim(),
      value: [option.city, option.district, option.state, option.state_code].join("|"),
      label: "",
    }).catch(() => {});
  }

  const Icon =
    state.status === "loading"
      ? Loader2
      : state.status === "found"
        ? Check
        : state.status === "error"
          ? AlertCircle
          : MapPin;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Icon className={`h-4 w-4 ${state.status === "loading" ? "animate-spin" : ""}`} />
        </div>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder={placeholder}
          disabled={disabled}
          className={[
            "h-12 w-full rounded-xl border bg-background pl-10 pr-4 text-sm text-foreground outline-none transition",
            error
              ? "border-destructive focus:border-destructive focus:ring-destructive/20"
              : "border-input focus:border-ring focus:ring-2 focus:ring-ring/20",
          ].join(" ")}
        />
      </div>

      {state.status === "multiple" && (
        <ul className="overflow-hidden rounded-xl border border-border">
          {state.options.map((option, idx) => (
            <li key={`${option.city}-${option.district}-${idx}`}>
              <button
                type="button"
                onClick={() => selectOption(option)}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm transition hover:bg-accent"
              >
                <span className="text-foreground">
                  {[option.city, option.district].filter(Boolean).join(", ")}
                </span>
                <span className="text-xs text-muted-foreground">{option.state}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hint && <p className={`text-xs ${hint.tone}`}>{hint.text}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
