export const REPORT_TARGET_TYPES = new Set(["listing", "message", "user", "photo"]);
export const REPORT_REASONS = new Set([
  "spam",
  "scam",
  "harassment",
  "counterfeit",
  "misdescribed",
  "prohibited",
  "other",
]);

export const REPORT_LIMIT = 10;
export const REPORT_LIMIT_MESSAGE = "You've sent a lot of reports today. We'll look at what you've sent.";

export function validateReportInput(body) {
  if (!body || !REPORT_TARGET_TYPES.has(body.target_type)) return { error: "Invalid target type." };
  if (typeof body.target_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.target_id)) {
    return { error: "Invalid target." };
  }
  if (!REPORT_REASONS.has(body.reason)) return { error: "Invalid reason." };
  const details = typeof body.details === "string" ? body.details.trim() : "";
  if (details.length > 1000) return { error: "Details must be 1000 characters or fewer." };
  return { value: { target_type: body.target_type, target_id: body.target_id, reason: body.reason, details: details || null } };
}

export function reportSubmissionDecision({ openDuplicate, reportsInLast24Hours }) {
  if (openDuplicate) return { kind: "duplicate", report: openDuplicate };
  if (reportsInLast24Hours >= REPORT_LIMIT) return { kind: "limited", error: REPORT_LIMIT_MESSAGE };
  return { kind: "allow" };
}
