function requireEnv(key: string, fallback: string): string {
  const raw = import.meta.env[key] as string | undefined;
  const value = (raw ?? fallback).trim().replace(/\/+$/, "");

  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }

  try {
    new URL(value);
  } catch {
    throw new Error(
      `Invalid URL for ${key}: "${value}". ` +
        `Expected something like http://127.0.0.1:8000/api/v1`
    );
  }

  return value;
}

export const API_BASE_URL = requireEnv(
  "VITE_API_BASE_URL",
  "http://127.0.0.1:8000/api/v1"
);

export const APP_NAME =
  (import.meta.env.VITE_APP_NAME as string | undefined) ?? "Subidha Admin";
