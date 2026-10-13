import { resendBatch, SITE_URL } from "./newsletter.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function notifySaleBuyer({ supabase, saleId }) {
  if (!process.env.RESEND_API_KEY) return;
  const { data: sale, error } = await supabase.from("sold_items").select("id, seller_id, buyer_id, series_title, issue_number, sale_price").eq("id", saleId).single();
  if (error) throw error;
  const { data: seller, error: sellerError } = await supabase.from("profiles").select("username").eq("id", sale.seller_id).single();
  if (sellerError) throw sellerError;
  const { data: auth, error: authError } = await supabase.auth.admin.getUserById(sale.buyer_id);
  if (authError || !auth?.user?.email) throw authError || new Error("Buyer has no email address.");
  const title = `${sale.series_title}${sale.issue_number ? ` #${sale.issue_number}` : ""}`;
  const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(sale.sale_price));
  const url = `${SITE_URL}/purchases/${sale.id}`;
  const sentence = `@${seller.username} says you bought ${title} for ${price}.`;
  await resendBatch([{ to: auth.user.email, subject: `Confirm your purchase of ${title}`, text: `${sentence}\n\nConfirm or report a problem: ${url}`, html: `<p>${esc(sentence)}</p><p><a href="${url}">Confirm</a> &nbsp; <a href="${url}">Something's wrong</a></p>` }]);
}
