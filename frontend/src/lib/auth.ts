import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/lib/constants";

export interface TokenPair {
  access: string;
  refresh: string;
}

export function persistTokenPair(tokens: TokenPair): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
}

export function clearTokenPair(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}
