import { API_BASE_URL } from "@/lib/constants";

function getApiOrigin(): string {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return "http://127.0.0.1:8000";
  }
}

function isPrivateIpv4Hostname(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) {
    return false;
  }

  if (octets[0] === 10) {
    return true;
  }

  if (octets[0] === 127) {
    return true;
  }

  if (octets[0] === 192 && octets[1] === 168) {
    return true;
  }

  return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
}

export function resolveApiMediaUrl(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }

  try {
    return new URL(trimmed, `${getApiOrigin()}/`).toString();
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "0.0.0.0" || host === "::1" || isPrivateIpv4Hostname(host);
}

/**
 * A media URL the visitor's browser (and phone AR apps like Scene Viewer) can reach.
 * Server renders may build media links against the internal API host
 * (127.0.0.1:8000); on a public site the same /media/ path is served by the
 * page's own origin, so re-root it there. Leaves local development untouched.
 */
export function toBrowserReachableMediaUrl(value?: string | null): string | null {
  const resolved = resolveApiMediaUrl(value);
  if (!resolved || typeof window === "undefined") {
    return resolved;
  }
  try {
    const url = new URL(resolved);
    if (isLocalHostname(url.hostname) && !isLocalHostname(window.location.hostname)) {
      return `${window.location.origin}${url.pathname}${url.search}`;
    }
    return resolved;
  } catch {
    return resolved;
  }
}

export function shouldBypassNextImageOptimization(
  value?: string | null
): boolean {
  const resolved = resolveApiMediaUrl(value);
  if (!resolved) {
    return false;
  }

  try {
    const url = new URL(resolved);
    const hostname = url.hostname.toLowerCase();

    return (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      isPrivateIpv4Hostname(hostname)
    );
  } catch {
    return false;
  }
}
