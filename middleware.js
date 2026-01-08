import { NextResponse } from "next/server";

export function middleware(req) {
  const hasAccess = req.cookies.get("cc_beta_access")?.value === "true";
  const path = req.nextUrl.pathname;

  if (
    !hasAccess &&
    !path.startsWith("/access") &&
    !path.startsWith("/_next") &&
    !path.startsWith("/api")
  ) {
    return NextResponse.redirect(new URL("/access", req.url));
  }

  return NextResponse.next();
}
