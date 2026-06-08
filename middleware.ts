import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const isAuthenticated = Boolean(request.cookies.get(AUTH_COOKIE)?.value);
  const isLoginPage = pathname === "/";
  const isPublicPage =
    isLoginPage ||
    pathname === "/forgot-password" ||
    pathname === "/register" ||
    pathname === "/reactivate";

  if (isPublicPage) {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    const loginUrl = new URL("/", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)"],
};
