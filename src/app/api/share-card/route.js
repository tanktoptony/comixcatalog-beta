import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { getServiceClient } from "@/lib/supabase/service";
import { getAuthedUser } from "@/lib/authServer";
import { TEMPLATES, CARD_SIZE, loadFonts } from "./templates";

// GET /api/share-card?type=collection → a 1080×1920 PNG of the CALLER'S OWN
// collection, for posting to an Instagram Story.
//
// Privacy model: owner-only. The user id comes from the verified Bearer
// token, never from a query param, so there is no way to ask for someone
// else's card. That also means a private profile's owner can still make a
// card: posting it is their own decision, made by pressing the button.
// Collection value is deliberately not on any card.
//
// Node runtime, same as src/app/opengraph-image.js (Satori + edge has font
// resolution problems).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to make a share card." }, { status: 401 });
  }

  const type = new URL(req.url).searchParams.get("type") || "collection";
  const template = Object.hasOwn(TEMPLATES, type) ? TEMPLATES[type] : null;
  if (!template) {
    return NextResponse.json({ error: "Unknown card type." }, { status: 400 });
  }

  const supabase = getServiceClient();

  let data;
  try {
    data = await template.load(supabase, user.id);
  } catch (err) {
    console.error("share-card load failed", { type, message: err?.message });
    return NextResponse.json({ error: "Couldn't load your collection. Try again." }, { status: 500 });
  }

  if (template.isEmpty(data)) {
    return NextResponse.json(
      { error: "Add a comic to your collection first. Then there's something to share." },
      { status: 422 }
    );
  }

  let fonts;
  try {
    fonts = await loadFonts();
  } catch (err) {
    console.error("share-card font load failed", { message: err?.message });
    return NextResponse.json({ error: "Couldn't make your card. Try again." }, { status: 500 });
  }

  const image = new ImageResponse(template.render(data), { ...CARD_SIZE, fonts });
  image.headers.set("Cache-Control", "private, no-store");
  image.headers.set("Content-Disposition", `inline; filename="${template.filename}"`);
  return image;
}
