import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { resendBatch, SITE_URL } from "@/lib/newsletter";

export async function POST(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = getServiceClient();
  const { data: sale, error: saleError } = await sb.from("sold_items").select("id, series_title, issue_number, seller_id").eq("id", id).eq("buyer_id", user.id).maybeSingle();
  if (saleError) return NextResponse.json({ error: "Could not report this purchase." }, { status: 500 });
  if (!sale) return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  const { error } = await sb.rpc("dispute_sale_transfer", { p_sale_id: id, p_buyer_id: user.id });
  if (error) return NextResponse.json({ error: error.code === "22023" ? error.message : "Could not report this purchase." }, { status: error.code === "22023" ? 409 : 500 });
  if (process.env.REPORTS_NOTIFY_EMAIL && process.env.RESEND_API_KEY) {
    const title = `${sale.series_title}${sale.issue_number ? ` #${sale.issue_number}` : ""}`;
    await resendBatch([{ to: process.env.REPORTS_NOTIFY_EMAIL, subject: `Disputed sale: ${title}`, text: `A buyer disputed ${title}. Review: ${SITE_URL}/admin/reports`, html: `<p>A buyer disputed ${title}.</p><p><a href="${SITE_URL}/admin/reports">Review reports</a></p>` }]).catch((emailError) => console.error("Dispute report email failed:", emailError));
  }
  return NextResponse.json({ ok: true });
}
