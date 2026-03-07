export const ACCESS_KEY = "access_token";
export const REFRESH_KEY = "refresh_token";
export const ROLE_KEY = "user_role";

export function getRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ROLE_KEY);
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(localStorage.getItem(ACCESS_KEY));
}
