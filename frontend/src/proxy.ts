import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set([
  "/",
  "/about",
  "/apply",
  "/contact",
  "/how-it-works",
  "/login",
  "/logout",
  "/register",
  "/unauthorized",
  "/lucky-plan",
  "/vision-trust",
  "/winner-history",
  "/winners",
  "/products",
]);

const ROLE_BASE_PATHS: Record<string, string> = {
  ADMIN: "/admin",
  CASHIER: "/cashier",
  PARTNER: "/partner",
  CUSTOMER: "/customer",
  VENDOR: "/vendor",
};

function normalizeRole(role: string | undefined): string {
  return (role || "").trim().toUpperCase();
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

function getRequiredRoleForPath(pathname: string): string | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "ADMIN";
  if (pathname === "/cashier" || pathname.startsWith("/cashier/")) return "CASHIER";
  if (pathname === "/partner" || pathname.startsWith("/partner/")) return "PARTNER";
  if (pathname === "/customer" || pathname.startsWith("/customer/")) return "CUSTOMER";
  if (pathname === "/vendor" || pathname.startsWith("/vendor/")) return "VENDOR";
  return null;
}

function getDashboardPathForRole(role: string): string {
  return ROLE_BASE_PATHS[role] || "/";
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    const authPresent = request.cookies.get("subidha_auth")?.value === "1";
    const role = normalizeRole(request.cookies.get("subidha_role")?.value);

    if (pathname === "/login" && authPresent && role && ROLE_BASE_PATHS[role]) {
      return NextResponse.redirect(new URL(getDashboardPathForRole(role), request.url));
    }

    return NextResponse.next();
  }

  const requiredRole = getRequiredRoleForPath(pathname);

  if (!requiredRole) {
    return NextResponse.next();
  }

  const authPresent = request.cookies.get("subidha_auth")?.value === "1";
  const role = normalizeRole(request.cookies.get("subidha_role")?.value);

  /**
   * Important:
   * Client auth state is stored primarily in localStorage and mirrored into cookies.
   * On immediate post-login navigations, cookie state can lag briefly behind client state.
   * If we hard-redirect to /login here on missing cookie, we create a redirect loop.
   *
   * So:
   * - if cookie role exists and mismatches, block here
   * - if cookie auth/role is missing, allow the request through
   *   and let the client RoleGuard resolve auth from stored session
   */
  if (!authPresent || !role) {
    return NextResponse.next();
  }

  if (role !== requiredRole) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/cashier/:path*",
    "/partner/:path*",
    "/customer/:path*",
    "/vendor/:path*",
    "/login",
    "/logout",
  ],
};