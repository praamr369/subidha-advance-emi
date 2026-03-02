export const API_TIMEOUT_MS = 10_000;
export const ACCESS_TOKEN_KEY = "subidha_access_token";
export const REFRESH_TOKEN_KEY = "subidha_refresh_token";

const defaultApiBaseUrl = "http://127.0.0.1:8000/api/v1";
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || defaultApiBaseUrl;

export const APP_ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  customerDashboard: "/customer/dashboard",
  partnerDashboard: "/partner/dashboard",
  adminDashboard: "/admin",
} as const;
