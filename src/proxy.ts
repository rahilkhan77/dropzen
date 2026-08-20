import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

const PUBLIC_PREFIXES = ["/login", "/forgot-password", "/reset-password", "/invite"];
const KYC_ALLOWED = ["/employee/kyc", "/notifications", "/change-password", "/profile"];
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:4000";

function isPublic(pathname: string) {
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname === "/logo.svg") return true;
  if (pathname.startsWith("/api/")) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (isPublic(pathname)) {
    if (token && (pathname === "/login" || pathname === "/forgot-password")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  if (pathname.startsWith("/admin")) {
    try {
      const me = await fetch(`${BACKEND}/api/auth/me`, {
        headers: { cookie: request.headers.get("cookie") || "" },
        cache: "no-store",
      });
      if (!me.ok) {
        const login = new URL("/login", request.url);
        login.searchParams.set("from", pathname);
        return NextResponse.redirect(login);
      }
      const json = (await me.json()) as { data?: { role?: string; kycStatus?: string | null } };
      if (json.data?.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (!pathname.startsWith("/admin") && !KYC_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    try {
      const me = await fetch(`${BACKEND}/api/auth/me`, {
        headers: { cookie: request.headers.get("cookie") || "" },
        cache: "no-store",
      });
      if (me.ok) {
        const json = (await me.json()) as { data?: { role?: string; kycStatus?: string | null } };
        if (json.data?.role === "EMPLOYEE" && json.data.kycStatus !== "APPROVED") {
          return NextResponse.redirect(new URL("/employee/kyc", request.url));
        }
      }
    } catch {
      /* backend unreachable — let the page handle it */
    }
  }

  if (pathname === "/bank-details" || pathname === "/bank-details/") {
    return NextResponse.redirect(new URL("/bank", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
