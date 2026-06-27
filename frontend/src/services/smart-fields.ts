import { apiFetch } from "@/lib/api";

export type PincodeOption = {
  city: string;
  district: string;
  state: string;
  state_code: string;
};

export type PincodeLookupResult = {
  pincode: string;
  primary: PincodeOption | null;
  options: PincodeOption[];
};

export type SmartSuggestion = {
  code: string;
  description: string;
  gst_rate: string | null;
  confidence: number;
  source: "LEARNED" | "HEURISTIC" | string;
};

/** Resolve a 6-digit pincode to one or more city/district/state options. */
export async function lookupPincode(pincode: string): Promise<PincodeLookupResult> {
  const clean = (pincode || "").trim();
  return apiFetch<PincodeLookupResult>(
    `/admin/smart/pincode/${encodeURIComponent(clean)}/`
  );
}

/** Rank HSN/SAC suggestions for a free-text product name/description. */
export async function suggestHsn(
  query: string,
  topN = 5
): Promise<SmartSuggestion[]> {
  const q = (query || "").trim();
  if (!q) return [];
  const res = await apiFetch<{ results: SmartSuggestion[] }>(
    `/admin/smart/hsn/suggest/?q=${encodeURIComponent(q)}&top_n=${topN}`
  );
  return res.results ?? [];
}

/** Generic suggestion dispatcher for any smart field key. */
export async function suggestField(
  fieldKey: string,
  query: string,
  topN = 5
): Promise<SmartSuggestion[]> {
  const q = (query || "").trim();
  if (!q) return [];
  const res = await apiFetch<{ results: SmartSuggestion[] }>(
    `/admin/smart/suggest/?field=${encodeURIComponent(fieldKey)}&q=${encodeURIComponent(
      q
    )}&top_n=${topN}`
  );
  return res.results ?? [];
}

/** Persist a user-confirmed value so future suggestions improve (self-learning). */
export async function confirmSuggestion(input: {
  fieldKey: string;
  input: string;
  value: string;
  label?: string;
  gstRate?: string | number | null;
}): Promise<{ stored: boolean }> {
  return apiFetch<{ stored: boolean }>("/admin/smart/confirm/", {
    method: "POST",
    body: {
      field_key: input.fieldKey,
      input: input.input,
      value: input.value,
      label: input.label ?? "",
      gst_rate: input.gstRate ?? null,
    },
  });
}
