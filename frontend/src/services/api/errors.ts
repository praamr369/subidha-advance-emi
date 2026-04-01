export type ApiError = {
  message: string;
  status?: number;
  details?: unknown;
};

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeHtml(value: string): boolean {
  return /<!doctype html|<html|<head|<body|<title/i.test(value);
}

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
    const raw = error.message || "Request failed";

    if (looksLikeHtml(raw)) {
      return {
        message: "Request failed because the server returned an HTML error page instead of JSON.",
      };
    }

    const cleaned = stripHtml(raw);
    return { message: cleaned || "Request failed" };
  }

  if (typeof error === "object" && error !== null) {
    const details = error as Record<string, unknown>;
    const message = pickMessage(details) ?? "Request failed";

    if (looksLikeHtml(message)) {
      return {
        message: "Request failed because the server returned an HTML error page instead of JSON.",
        status: typeof details.status === "number" ? details.status : undefined,
        details,
      };
    }

    return {
      message: stripHtml(message) || "Request failed",
      status: typeof details.status === "number" ? details.status : undefined,
      details,
    };
  }

  return { message: "Unknown API error", details: error };
}