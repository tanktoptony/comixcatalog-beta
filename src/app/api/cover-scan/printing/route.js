import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { isPrintingKind, printingLabel, validateUpc } from "@/lib/review";

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to report a printing." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const issueId = Number(body?.gcd_issue_id);
  const kind = String(body?.kind ?? "");
  const upc = String(body?.upc ?? "").trim() || null;
  if (!body?.scan_id || !Number.isInteger(issueId) || !isPrintingKind(kind) || !validateUpc(upc)) {
    return NextResponse.json({ error: "Check the printing type and barcode." }, { status: 400 });
  }
  const supabase = getServiceClient();
  const { data: scan, error: scanError } = await supabase.from("cover_scans")
    .select("id, candidates, storage_path").eq("id", body.scan_id).eq("user_id", user.id).maybeSingle();
  if (scanError) return NextResponse.json({ error: "Could not check that scan." }, { status: 500 });
  if (!scan?.storage_path) return NextResponse.json({ error: "Scan photo not found." }, { status: 404 });
  if (!(scan.candidates ?? []).some((row) => Number(row.gcd_issue_id) === issueId)) {
    return NextResponse.json({ error: "That issue was not a scan result." }, { status: 400 });
  }
  const printingName = printingLabel(kind, body.printing_name).slice(0, 120);
  const { error } = await supabase.from("issue_printings").insert({
    gcd_issue_id: issueId, kind, printing_name: printingName, upc,
    submitted_by: user.id, status: "pending", photo_path: scan.storage_path, scan_id: scan.id,
  });
  if (error?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true, message: "You already reported this one." });
  }
  if (error) {
    console.error("cover scan printing insert failed", error);
    return NextResponse.json({ error: "Could not send that report." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
