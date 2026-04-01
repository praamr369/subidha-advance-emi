import { API_BASE_URL as ENV_API_BASE_URL } from "@/lib/env";

export const APP_NAME = "SUBIDHA CORE";
export const ACCESS_TOKEN_KEY = "subidha_access_token";
export const REFRESH_TOKEN_KEY = "subidha_refresh_token";
export const SESSION_KEY = "subidha_session";
export const DEFAULT_PAGE_SIZE = 20;

// backward-compatible exports used by existing pages
export const API_TIMEOUT_MS = 10_000;
export const API_BASE_URL = ENV_API_BASE_URL;
export const APP_ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  customerDashboard: "/customer",
  partnerDashboard: "/partner",
  adminDashboard: "/admin",
} as const;
