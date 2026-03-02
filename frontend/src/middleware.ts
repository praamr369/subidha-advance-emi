import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = ["/dashboard", "/customer", "/partner", "/admin"];
const publicAuthPaths = new Set(["/login", "/register", "/admin/login"]);

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected || publicAuthPaths.has(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access")?.value;

  if (!accessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/customer/:path*", "/partner/:path*", "/admin/:path*"],
};
