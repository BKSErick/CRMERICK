import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  isAdminEmail,
  isPublicCrmRequest,
  safeReturnPath,
  verifyAdminSession,
} from "@/lib/adminAuth";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicCrmRequest(pathname, request.method)) return NextResponse.next();

  const session = await verifyAdminSession(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.CRM_AUTH_SECRET,
  );

  if (session && isAdminEmail(session.email, process.env.CRM_ADMIN_EMAIL)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Nao autorizado." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", safeReturnPath(`${pathname}${search}`));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
