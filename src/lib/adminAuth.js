import { NextResponse } from "next/server";
import { ADMIN_ID } from "@/lib/admin";
import { getAuthedUser } from "@/lib/authServer";
import { aalFromToken, bearerToken } from "@/lib/adminAal";

// The one gate for admin actions that change things (review queue, Pro
// toggles, blog posts, production assets). Requires the admin account AND a
// session that passed two-factor (aal2), so a stolen password alone can't
// post to the blog or approve catalog changes (the 2026-08-05 defacement
// went through admin auth).
//
// Returns { admin } on success, or { response } to return as-is.
export async function requireAdmin(req) {
  const user = await getAuthedUser(req);
  if (!user || user.id !== ADMIN_ID) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (aalFromToken(bearerToken(req)) !== "aal2") {
    return { response: NextResponse.json({ error: "Two-factor sign-in required.", mfa_required: true }, { status: 401 }) };
  }
  return { admin: user };
}
