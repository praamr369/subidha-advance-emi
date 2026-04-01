export type ApiError = {
  message: string;
  status?: number;
  details?: unknown;
};

function pickMessage(details: Record<string, unknown>): string | null {
  const detail = details.detail;
  if (typeof detail === "string" && detail.trim()) return detail;

  const message = details.message;
  if (typeof message === "string" && message.trim()) return message;

  const nonField = details.non_field_errors;
  if (Array.isArray(nonField) && typeof nonField[0] === "string") {
    return nonField[0];
  }

  const firstValue = Object.values(details).find((value) => {
    if (typeof value === "string" && value.trim()) return true;
    return Array.isArray(value) && typeof value[0] === "string";
  });

  if (typeof firstValue === "string") return firstValue;
  if (Array.isArray(firstValue) && typeof firstValue[0] === "string") return firstValue[0];

  return null;
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof Error) {
    return { message: error.message || "Request failed" };
  }

  if (typeof error === "object" && error !== null) {
    const details = error as Record<string, unknown>;
    return {
      message: pickMessage(details) ?? "Request failed",
      status: typeof details.status === "number" ? details.status : undefined,
      details,
    };
  }

  return { message: "Unknown API error", details: error };
}
