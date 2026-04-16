function normalizeApiBaseUrl(raw: string): string {
  const fallback = "http://127.0.0.1:8000/api/v1";
  const value = (raw || "").trim();
  if (!value) return fallback;

  const normalizePath = (pathname: string): string => {
    // Ensure the frontend always targets the canonical backend prefix: `/api/v1`.
    const trimmed = (pathname || "/").replace(/\/+$/, "");

    if (trimmed === "" || trimmed === "/") return "/api/v1";
    if (trimmed.endsWith("/api/v1")) return trimmed;
    if (trimmed.endsWith("/api")) return trimmed.replace(/\/api$/, "/api/v1");

    return `${trimmed}/api/v1`;
  };

  try {
    const url = new URL(value);
    url.pathname = normalizePath(url.pathname);
    // Prevent surprising behavior if someone pastes a URL with query/hash.
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    // Support relative values like `/api/v1` in local/proxy setups.
    const base = value.replace(/\/+$/, "");
    if (base.endsWith("/api/v1")) return base;
    if (base.endsWith("/api")) return base.replace(/\/api$/, "/api/v1");
    return `${base}/api/v1`;
  }
}

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1"
);
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "SUBIDHA CORE";
export const NODE_ENV = process.env.NODE_ENV || "development";
