import { signTipsUnsubscribeToken } from "./activationNudges.js";

const SITE_URL = "https://www.comixcatalog.com";
const COLLECTION_URL = `${SITE_URL}/library?utm_source=email&utm_medium=lifecycle&utm_campaign=value-2026-11`;

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function count(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export function buildValueEmail({ email, userId, username, totalValue, ownedCount, pricedCount, topBooks = [] }) {
  const total = money(totalValue);
  const owned = Number(ownedCount) || 0;
  const priced = Number(pricedCount) || 0;
  const ownedLabel = count(owned);
  const pricedLabel = count(priced);
  const books = topBooks.filter((book) => book?.guideUrl && book?.issueUrl && book?.title && book?.gradeLabel && Number.isFinite(Number(book?.value))).slice(0, 5);
  const topHeading = books.length === 1 ? "Your most valuable book" : "Your most valuable books";
  const unsubscribeUrl = `${SITE_URL}/unsubscribe/tips?token=${encodeURIComponent(signTipsUnsubscribeToken(userId))}`;
  const greeting = username ? `Hi ${username},` : "Hi,";
  const firstParagraph = `Your collection on ComixCatalog is valued at ${total} across ${ownedLabel} ${owned === 1 ? "book" : "books"}.`;
  let valueSentence = `We now price books with PriceCharting's sold data, matched to each copy's grade. ${pricedLabel} of your ${ownedLabel} books have a value so far.`;
  if (priced === owned) valueSentence = owned === 1 ? "We now price books with PriceCharting's sold data, matched to each copy's grade. Your book has a value." : `We now price books with PriceCharting's sold data, matched to each copy's grade. All ${ownedLabel} of your books have a value.`;

  const textLines = [greeting, "", firstParagraph, "", valueSentence];
  if (books.length) {
    textLines.push("", topHeading);
    for (const book of books) textLines.push(`${book.title}, ${book.gradeLabel}: ${money(book.value)} (${book.guideUrl})`);
  }
  textLines.push("", "Add a grade to a book and its value follows the grade.", "", `See your collection: ${COLLECTION_URL}`, "", "Values by PriceCharting: https://www.pricecharting.com", "", "Tony", "ComixCatalog", "", `Unsubscribe from tips and collection updates: ${unsubscribeUrl}`);

  const bookRows = books.map((book) => `<tr><td style="padding:6px 0;font-family:Arial,sans-serif;font-size:15px;color:#222"><a href="${escapeHtml(book.issueUrl)}" style="color:#222">${escapeHtml(book.title)}</a>, ${escapeHtml(book.gradeLabel)}: <a href="${escapeHtml(book.guideUrl)}" style="color:#222;font-weight:bold">${money(book.value)}</a></td></tr>`).join("");
  const topSection = books.length ? `<h2 style="margin:24px 0 8px;font-family:Arial,sans-serif;font-size:18px;color:#222">${topHeading}</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${bookRows}</table>` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f3f3"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f3f3"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff"><tr><td style="padding:18px 24px;background:#0b0d12;color:#f5c518;font-family:Arial,sans-serif;font-size:20px;font-weight:bold">ComixCatalog</td></tr><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#222"><p style="margin:0 0 16px;font-size:16px">${escapeHtml(greeting)}</p><p style="margin:0 0 16px;font-size:16px">Your collection on ComixCatalog is valued at <strong>${total}</strong> across ${ownedLabel} ${owned === 1 ? "book" : "books"}.</p><p style="margin:0 0 16px;font-size:16px">${escapeHtml(valueSentence)}</p>${topSection}<p style="margin:24px 0 16px;font-size:16px">Add a grade to a book and its value follows the grade.</p><p style="margin:0 0 20px"><a href="${COLLECTION_URL}" style="display:inline-block;padding:11px 17px;background:#f5c518;color:#111;font-family:Arial,sans-serif;font-weight:bold;text-decoration:none;border-radius:4px">See your collection</a></p><p style="margin:0 0 20px;font-size:12px;color:#666">Values by <a href="https://www.pricecharting.com" style="color:#666">PriceCharting</a></p><p style="margin:0;font-size:16px">Tony<br>ComixCatalog</p></td></tr><tr><td style="padding:16px 24px;background:#f7f7f7;font-family:Arial,sans-serif;font-size:12px;color:#666"><a href="${unsubscribeUrl}" style="color:#666">Unsubscribe from tips and collection updates</a></td></tr></table></td></tr></table></body></html>`;

  return { to: email, subject: `Your collection is worth ${total}`, text: textLines.join("\n"), html, headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } };
}
