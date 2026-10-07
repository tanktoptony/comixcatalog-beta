const PRINTING_KINDS = new Set(["variant", "newsstand", "reprint", "other"]);

export function validateUpc(value) {
  const upc = String(value ?? "").trim();
  return upc === "" || /^\d{12,18}$/.test(upc);
}

export function printingLabel(kind, name) {
  const supplied = String(name ?? "").trim();
  if (supplied) return supplied;
  return {
    variant: "Variant cover",
    newsstand: "Newsstand",
    reprint: "Reprint or 2nd print",
    other: "Other printing",
  }[kind] ?? "Other printing";
}

export function isPrintingKind(kind) {
  return PRINTING_KINDS.has(kind);
}

export function canSeeComic(row, userId, adminId) {
  return row?.review_status === "approved"
    || Boolean(userId && (row?.created_by === userId || userId === adminId));
}

export function reviewActionToUpdate(kind, action, note, reviewerId) {
  const review_note = String(note ?? "").trim() || null;
  const reviewed_at = new Date().toISOString();
  if (kind === "printings") {
    const status = { approve: "accepted", deny: "rejected", duplicate: "duplicate" }[action];
    if (!status) return null;
    return { status, reviewed_by: reviewerId, reviewed_at, review_note };
  }
  if (kind === "books") {
    const review_status = { approve: "approved", deny: "denied" }[action];
    if (!review_status) return null;
    return { review_status, reviewed_by: reviewerId, reviewed_at, review_note };
  }
  return null;
}
