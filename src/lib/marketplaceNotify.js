import { resendBatch } from "./newsletter.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  })[character]);
}

export async function notifyAdmin(message, subject = "Marketplace alert") {
  const to = process.env.REPORTS_NOTIFY_EMAIL;
  if (!to) {
    console.warn(message);
    return;
  }
  await resendBatch([{
    to,
    subject,
    text: message,
    html: `<p>${escapeHtml(message)}</p>`,
  }]);
}
