export const BULK_SCAN_CONCURRENCY = 3;
export const BULK_ADD_BATCH_SIZE = 25;

export function createScanInput({ source, file = null, photoUrl = null, barcode = null } = {}) {
  return {
    id: crypto.randomUUID(), source, file, photoUrl, barcode,
    status: source === "photo" ? "queued" : "identifying",
    details: emptyScanDetails(), wantlist: false, owned: false, ownedChoice: "another",
  };
}

export function scanInputUsesVision(input) {
  return (typeof input === "string" ? input : input?.source) !== "barcode";
}

export function emptyScanDetails() {
  return { condition: "", slab_company: "", grade_numeric: "", slab_cert_number: "", purchase_price: "" };
}

export function scanDetailsPayload(details = {}) {
  const slab = String(details.slab_company ?? "").trim();
  const grade = details.grade_numeric === "" || details.grade_numeric == null ? null : Number(details.grade_numeric);
  const price = String(details.purchase_price ?? "").trim();
  return {
    condition: slab ? null : String(details.condition ?? "").trim() || null,
    slab_company: slab || null,
    grade_numeric: slab && Number.isFinite(grade) ? grade : null,
    slab_cert_number: slab ? String(details.slab_cert_number ?? "").trim() || null : null,
    purchase_price: price !== "" && Number.isFinite(Number(price)) && Number(price) >= 0 ? Number(price) : null,
  };
}

export function reviewRowsToAddPayload(rows = []) {
  return rows
    .filter((row) => row.status === "matched" && row.selected && !(row.owned && !row.wantlist && row.ownedChoice === "skip"))
    .map((row) => ({
      client_id: row.id,
      scan_id: row.scanId,
      gcd_issue_id: Number(row.selected.gcd_issue_id),
      status: row.wantlist ? "wishlist" : "owned",
      another_copy: Boolean(row.owned && row.ownedChoice === "another" && !row.wantlist),
      ...scanDetailsPayload(row.details),
    }));
}

export function splitScanBatches(items, size = BULK_ADD_BATCH_SIZE) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

// Framework-free queue so concurrency and quota behavior stay testable.
export async function runScanQueue(items, worker, { concurrency = BULK_SCAN_CONCURRENCY, canStart = () => true } = {}) {
  const pending = [...items];
  const completed = [];
  async function lane() {
    while (pending.length && canStart()) {
      const item = pending.shift();
      completed.push(await worker(item));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, lane));
  return { completed, stopped: pending };
}
