export function normalizeListingSyncReport(value) {
  const report = value && typeof value === "object" ? value : {};
  return {
    missingCount: Number(report.missing_count) || 0,
    unresolvedFailureCount: Number(report.unresolved_failure_count) || 0,
    missingExamples: Array.isArray(report.missing_examples) ? report.missing_examples : [],
    latestFailures: Array.isArray(report.latest_failures) ? report.latest_failures : [],
    repairRowsTouched: Number(report.repair_rows_touched) || 0,
  };
}

export function listingSyncHasProblems(report) {
  return report.missingCount > 0 || report.unresolvedFailureCount > 0;
}

export function listingSyncSummary(report) {
  const lines = [
    "## Listing sync check",
    "",
    `- Missing active listings: ${report.missingCount}`,
    `- Unresolved trigger failures: ${report.unresolvedFailureCount}`,
  ];
  if (report.missingExamples.length) {
    lines.push("", "### Missing listing examples", "", "| Collection item | User | GCD issue |", "| --- | --- | ---: |");
    for (const row of report.missingExamples) lines.push(`| ${row.id} | ${row.user_id} | ${row.gcd_issue_id ?? ""} |`);
  }
  if (report.latestFailures.length) {
    lines.push("", "### Latest unresolved failures", "", "| Time | Collection item | SQLSTATE | Error |", "| --- | --- | --- | --- |");
    for (const row of report.latestFailures) lines.push(`| ${row.created_at} | ${row.collection_item_id} | ${row.sqlstate} | ${String(row.error_message).replaceAll("|", "\\|")} |`);
  }
  return `${lines.join("\n")}\n`;
}
