export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function readLocalStorage(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorage(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Enhancement-only persistence.
  }
}

export function removeLocalStorage(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Enhancement-only persistence.
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readLocalStorage(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeLocalStorage(key, JSON.stringify(value));
  } catch {
    // Enhancement-only persistence.
  }
}

export function readStringArray(key: string): string[] {
  const parsed = readJson<unknown>(key, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value) => typeof value === "string" && value.trim().length > 0);
}

export function writeStringArray(key: string, values: readonly string[]): void {
  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean);
  writeJson(key, normalized);
}

