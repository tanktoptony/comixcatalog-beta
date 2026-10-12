import { isValidUpc, normalizeUpc, parseUpc } from "../../src/lib/printings.js";

export function catalogBarcodeRow(gcdIssueId, rawBarcode) {
  const id = Number(gcdIssueId);
  const upc = normalizeUpc(rawBarcode);
  const parsed = parseUpc(upc);
  if (!Number.isInteger(id) || id <= 0 || !parsed || !isValidUpc(upc)) return null;
  return {
    gcd_issue_id: id,
    upc: parsed.digits,
    submitted_by: null,
    status: "accepted",
  };
}

export async function insertCatalogBarcode(supabase, row) {
  if (!row) return false;
  const { data, error } = await supabase
    .from("issue_printings")
    .select("id")
    .eq("gcd_issue_id", row.gcd_issue_id)
    .eq("upc", row.upc)
    .eq("status", "accepted")
    .is("submitted_by", null)
    .limit(1);
  if (error) throw error;
  if (data?.length) return false;

  const result = await supabase.from("issue_printings").insert(row);
  // A concurrent refresh may have inserted the same accepted catalog row
  // after the read. The partial unique index makes that harmless without
  // constraining any user-submitted pending row.
  if (result.error?.code === "23505") return false;
  if (result.error) throw result.error;
  return true;
}
