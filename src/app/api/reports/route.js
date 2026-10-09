import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { resendBatch } from "@/lib/newsletter";
import { reportSubmissionDecision, validateReportInput } from "@/lib/reports";
import { getServiceClient } from "@/lib/supabase/service";

const SITE_URL = "https://www.comixcatalog.com";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

async function loadTarget(supabase, report, reporterId) {
  if (report.target_type === "listing") {
    const { data, error } = await supabase.from("listings").select("id, seller_id, series_title, issue_number").eq("id", report.target_id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (data.seller_id === reporterId) return { own: true };
    return { text: `${data.series_title}${data.issue_number ? ` #${data.issue_number}` : ""}`, url: `${SITE_URL}/listing/${data.id}` };
  }
  if (report.target_type === "user") {
    const { data, error } = await supabase.from("profiles").select("id, username").eq("id", report.target_id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (data.id === reporterId) return { own: true };
    return { text: `@${data.username || "unknown"}`, url: data.username ? `${SITE_URL}/u/${encodeURIComponent(data.username)}` : null };
  }
  if (report.target_type === "message") {
    const { data, error } = await supabase.from("messages").select("id, sender_id, recipient_id, body").eq("id", report.target_id).maybeSingle();
    if (error) throw error;
    if (!data || (data.sender_id !== reporterId && data.recipient_id !== reporterId)) return null;
    const ids = [data.sender_id, data.recipient_id];
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, username").in("id", ids);
    if (profileError) throw profileError;
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));
    return { text: `Message from @${names.get(data.sender_id) || "unknown"} to @${names.get(data.recipient_id) || "unknown"}: ${data.body}` };
  }
  const { data, error } = await supabase.from("listing_photos").select("id, owner_id, listing_id, kind").eq("id", report.target_id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.owner_id === reporterId) return { own: true };
  return { text: `${data.kind || "Listing"} photo`, url: data.listing_id ? `${SITE_URL}/listing/${data.listing_id}` : null };
}

async function notify(report, reporterUsername, target) {
  const to = process.env.REPORTS_NOTIFY_EMAIL;
  if (!to) {
    console.warn("REPORTS_NOTIFY_EMAIL is not set; report notification skipped.");
    return;
  }
  const adminUrl = `${SITE_URL}/admin/reports`;
  const targetLine = target.url ? `${target.text} (${target.url})` : target.text;
  const lines = [`Reporter: @${reporterUsername || "unknown"}`, `Target: ${report.target_type}`, targetLine, `Reason: ${report.reason}`, `Details: ${report.details || "None"}`, `Review: ${adminUrl}`];
  const html = `<p><strong>Reporter:</strong> @${esc(reporterUsername || "unknown")}</p><p><strong>Target:</strong> ${esc(report.target_type)}</p><p>${target.url ? `<a href="${esc(target.url)}">${esc(target.text)}</a>` : esc(target.text)}</p><p><strong>Reason:</strong> ${esc(report.reason)}</p><p><strong>Details:</strong> ${esc(report.details || "None")}</p><p><a href="${adminUrl}">Review reports</a></p>`;
  await resendBatch([{ to, subject: `Report: ${report.reason} on ${report.target_type}`, text: lines.join("\n"), html }]);
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = validateReportInput(await req.json().catch(() => null));
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const report = parsed.value;
  const supabase = getServiceClient();
  try {
    const target = await loadTarget(supabase, report, user.id);
    if (!target) return NextResponse.json({ error: "That item could not be found." }, { status: 404 });
    if (target.own) return NextResponse.json({ error: report.target_type === "listing" ? "You can't report your own listing." : "You can't report yourself." }, { status: 400 });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [duplicateResult, countResult] = await Promise.all([
      supabase.from("reports").select("id, reporter_id, target_type, target_id, reason, details, status, created_at").eq("reporter_id", user.id).eq("target_type", report.target_type).eq("target_id", report.target_id).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", user.id).gte("created_at", since),
    ]);
    if (duplicateResult.error) throw duplicateResult.error;
    if (countResult.error) throw countResult.error;
    const decision = reportSubmissionDecision({ openDuplicate: duplicateResult.data, reportsInLast24Hours: countResult.count ?? 0 });
    if (decision.kind === "duplicate") return NextResponse.json({ ok: true, report: decision.report });
    if (decision.kind === "limited") return NextResponse.json({ error: decision.error }, { status: 429 });
    const { data: inserted, error } = await supabase.from("reports").insert({ reporter_id: user.id, ...report }).select("id, reporter_id, target_type, target_id, reason, details, status, created_at").single();
    if (error) throw error;
    const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
    try { await notify(inserted, profile?.username, target); } catch (emailError) { console.error("Report notification email failed:", emailError); }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/reports failed:", error);
    return NextResponse.json({ error: "Could not send report." }, { status: 500 });
  }
}
