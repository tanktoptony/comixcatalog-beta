// The assurance level ("aal1" password only, "aal2" password + 2FA code) is a
// claim inside the Supabase access token. Read it only from a token that
// getAuthedUser() has already verified with Supabase's auth server.
export function aalFromToken(token) {
  try {
    const payload = String(token ?? "").split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json).aal ?? null;
  } catch {
    return null;
  }
}

export function bearerToken(req) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}
