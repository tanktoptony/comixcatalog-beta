import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { validateMarkSold } from "@/lib/markSold";
import { revalidateListings } from "@/lib/marketplace";

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to record a sale." }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Couldn't read that request." }, { status: 400 });
  }
  const checked = validateMarkSold(body);
  if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });

  const { collectionItemId, salePrice, soldVia } = checked.value;
  try {
    const { data, error } = await getServiceClient().rpc("mark_item_sold", {
      p_seller_id: user.id,
      p_collection_item_id: collectionItemId,
      p_sale_price: salePrice,
      p_sold_via: soldVia,
    });
    if (error) {
      if (error.code === "P0002") {
        return NextResponse.json({ error: "That for-sale item wasn't found." }, { status: 404 });
      }
      if (error.code === "22023") return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }
    revalidateListings();
    return NextResponse.json({ soldItemId: data });
  } catch (error) {
    console.error("POST /api/collection/mark-sold failed:", error);
    return NextResponse.json({ error: "Couldn't record that sale. Nothing was changed." }, { status: 500 });
  }
}
