import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { loadEveryoneFeed, loadFollowingFeed } from "@/lib/feed/loadFeed";

// The collector feed on Your shelf. scope=following (the default) shows the
// members the viewer follows; scope=everyone shows recently active public
// members. Signed in only: both scopes leave out members the viewer has
// blocked or been blocked by.
export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = new URL(req.url).searchParams.get("scope") === "everyone" ? "everyone" : "following";
  try {
    const result = scope === "everyone" ? await loadEveryoneFeed(user.id) : await loadFollowingFeed(user.id);
    return NextResponse.json({ scope, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(`GET /api/feed (${scope}) failed:`, error);
    return NextResponse.json({ error: "Could not load the feed." }, { status: 500 });
  }
}
