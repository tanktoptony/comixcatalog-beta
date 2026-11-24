// Email preferences (notification_settings, migrations 0046 + 0116) and the
// activity and weekly digest emails. Pure: no imports, safe in the browser
// (the account page reads the constants) and in scripts.

export const ACTIVITY_MODES = ["instant", "daily", "off"];
export const ACTIVITY_MODE_LABELS = { instant: "Right away", daily: "Summary", off: "Off" };
export const DEFAULT_PREFS = { email_on_message: true, email_activity: "daily", email_weekly_digest: true };

// A missing row (or a column the database doesn't have yet) means defaults.
export function prefsFromRow(row) {
  return {
    email_on_message: row?.email_on_message !== false,
    email_activity: ACTIVITY_MODES.includes(row?.email_activity) ? row.email_activity : DEFAULT_PREFS.email_activity,
    email_weekly_digest: row?.email_weekly_digest !== false,
  };
}

// "Right away" members get at most one activity email per this many
// minutes; anything held back goes out with the next one or the daily run.
export const INSTANT_GAP_MINUTES = 10;

export function instantDue(lastEmailedAt, now = new Date()) {
  if (!lastEmailedAt) return true;
  return now.getTime() - new Date(lastEmailedAt).getTime() >= INSTANT_GAP_MINUTES * 60_000;
}

export const SITE_URL = "https://www.comixcatalog.com";
export const SETTINGS_URL = `${SITE_URL}/account#notifications`;

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const VERB = {
  reply: "replied to your comment on",
  mention: "mentioned you on",
  comment: "commented on",
  review: "commented on your review of",
  follow: "followed you",
  trade_match: "is a trade match for",
  wantlist_for_sale: "listed a book from your wantlist:",
};

export function activityLine(item) {
  if (item.kind === "review_queue") return item.label;
  if (item.kind === "request_done") return `${item.label} is in the catalog now`;
  const actor = item.actor ? `@${item.actor}` : "Someone";
  const verb = VERB[item.kind] ?? "commented on";
  return item.kind === "follow" ? `${actor} ${verb}` : `${actor} ${verb} ${item.label}`;
}

const absolute = (url) => (String(url || "").startsWith("/") ? `${SITE_URL}${url}` : String(url || SITE_URL));

function shell({ bodyHtml, footerHtml }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f3f3"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f3f3"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff"><tr><td style="padding:18px 24px;background:#0b0d12;color:#f5c518;font-family:Arial,sans-serif;font-size:20px;font-weight:bold">ComixCatalog</td></tr><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#222">${bodyHtml}</td></tr><tr><td style="padding:16px 24px;background:#f7f7f7;font-family:Arial,sans-serif;font-size:12px;color:#666">${footerHtml}</td></tr></table></td></tr></table></body></html>`;
}

const button = (href, label) => `<p style="margin:20px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 17px;background:#f5c518;color:#111;font-family:Arial,sans-serif;font-weight:bold;text-decoration:none;border-radius:4px">${escapeHtml(label)}</a></p>`;

// Says what is in the email. "20 new replies" for 20 finished book requests
// went to three members on 2026-11-24.
export function activitySubject(items) {
  if (items.length === 1) return activityLine(items[0]);
  if (items.every((item) => item.kind === "request_done")) return `${items.length} books you asked for are in the catalog`;
  if (items.every((item) => item.kind === "reply" || item.kind === "mention")) return `${items.length} new replies and mentions on ComixCatalog`;
  return `${items.length} new things for you on ComixCatalog`;
}

// items: [{ kind, actor, label, excerpt, url }], newest first.
export function buildActivityEmail({ items, mode, unsubscribeUrl = SETTINGS_URL }) {
  const shown = items.slice(0, 10);
  const more = items.length - shown.length;
  const subject = activitySubject(items);
  const lead = mode === "daily" ? "Here's what's new for you on ComixCatalog." : "New on ComixCatalog:";
  const rows = shown.map((item) => {
    const excerpt = item.excerpt ? `<br><span style="color:#555">“${escapeHtml(item.excerpt)}”</span>` : "";
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-size:15px"><a href="${escapeHtml(absolute(item.url))}" style="color:#222">${escapeHtml(activityLine(item))}</a>${excerpt}</td></tr>`;
  }).join("");
  const moreHtml = more > 0 ? `<p style="margin:12px 0 0;font-size:14px;color:#555">And ${more} more.</p>` : "";
  const footer = `You can choose Right away, Summary or Off in <a href="${SETTINGS_URL}" style="color:#666">your settings</a>. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#666">Stop these emails</a>`;
  const html = shell({
    bodyHtml: `<p style="margin:0 0 12px;font-size:16px">${escapeHtml(lead)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>${moreHtml}${button(`${SITE_URL}/inbox`, "Open your inbox")}`,
    footerHtml: footer,
  });
  const text = [lead, "", ...shown.map((item) => `- ${activityLine(item)}${item.excerpt ? `: "${item.excerpt}"` : ""}\n  ${absolute(item.url)}`), more > 0 ? `And ${more} more.` : null, "", `Open your inbox: ${SITE_URL}/inbox`, "", `Change how often: ${SETTINGS_URL}`, `Stop these emails: ${unsubscribeUrl}`].filter((line) => line !== null).join("\n");
  return { subject, html, text };
}

const money = (value) => `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const count = (value) => Number(value).toLocaleString("en-US");

// What one followed collector did, without the name ("added 12 books and
// wanted 3"), or null when they did nothing this week.
export function followActivity(person) {
  const parts = [];
  if (person.added) parts.push(`added ${count(person.added)} ${person.added === 1 ? "book" : "books"}`);
  if (person.wanted) parts.push(`wanted ${count(person.wanted)}`);
  if (person.listed) parts.push(`listed ${count(person.listed)} for sale`);
  if (person.reviewed) parts.push(`reviewed ${count(person.reviewed)}`);
  if (!parts.length) return null;
  const last = parts.pop();
  return parts.length ? `${parts.join(", ")} and ${last}` : last;
}

export function followLine(person) {
  const activity = followActivity(person);
  return activity ? `@${person.username} ${activity}` : null;
}

// Something new this week. The value line and trade matches ride along but
// don't trigger a send on their own: both are standing facts, and a weekly
// email repeating them is noise.
export function digestHasNews(digest) {
  return Boolean(digest.following?.some(followLine) || digest.wantlistListed?.length || digest.unread > 0);
}

// digest: { value: { total, change }, following: [{ username, added, wanted,
// listed, reviewed }], wantlistListed: [{ title, price, url }], tradeMatches,
// unread }
export function buildDigestEmail({ digest, unsubscribeUrl }) {
  const sections = [];
  const text = ["Your week on ComixCatalog", ""];
  if (digest.value?.total > 0) {
    const change = digest.value.change;
    const changeText = change && Math.abs(change) >= 1 ? ` (${change > 0 ? "up" : "down"} ${money(Math.abs(change))} this week)` : "";
    sections.push(`<p style="margin:0 0 16px;font-size:16px">Your collection is valued at <strong>${money(digest.value.total)}</strong>${escapeHtml(changeText)}. <span style="font-size:12px;color:#666">Values by <a href="https://www.pricecharting.com" style="color:#666">PriceCharting</a></span></p>`);
    text.push(`Your collection is valued at ${money(digest.value.total)}${changeText}. Values by PriceCharting.`, "");
  }
  const wanted = (digest.wantlistListed ?? []).slice(0, 6);
  if (wanted.length) {
    sections.push(`<h2 style="margin:20px 0 8px;font-size:17px">From your wantlist, now for sale</h2>${wanted.map((book) => `<p style="margin:0 0 6px;font-size:15px"><a href="${escapeHtml(absolute(book.url))}" style="color:#222">${escapeHtml(book.title)}</a>${book.price != null ? `, ${money(book.price)}` : ", open to offers"}</p>`).join("")}`);
    text.push("From your wantlist, now for sale:", ...wanted.map((book) => `- ${book.title}${book.price != null ? `, ${money(book.price)}` : ", open to offers"}: ${absolute(book.url)}`), "");
  }
  const people = (digest.following ?? []).filter((person) => followActivity(person)).slice(0, 8);
  if (people.length) {
    const profileUrl = (person) => `${SITE_URL}/u/${encodeURIComponent(person.username)}`;
    sections.push(`<h2 style="margin:20px 0 8px;font-size:17px">Collectors you follow</h2>${people.map((person) => `<p style="margin:0 0 6px;font-size:15px"><a href="${escapeHtml(profileUrl(person))}" style="color:#222;font-weight:bold">@${escapeHtml(person.username)}</a> ${escapeHtml(followActivity(person))}</p>`).join("")}`);
    text.push("Collectors you follow:", ...people.map((person) => `- ${followLine(person)}: ${profileUrl(person)}`), "");
  }
  if (digest.tradeMatches > 0) {
    const line = `You have trade matches with ${digest.tradeMatches} ${digest.tradeMatches === 1 ? "collector" : "collectors"}.`;
    sections.push(`<p style="margin:20px 0 6px;font-size:15px"><a href="${SITE_URL}/matches" style="color:#222">${escapeHtml(line)}</a></p>`);
    text.push(`${line} ${SITE_URL}/matches`, "");
  }
  if (digest.unread > 0) {
    const line = `${digest.unread} unread ${digest.unread === 1 ? "reply or mention" : "replies and mentions"} in your inbox.`;
    sections.push(`<p style="margin:6px 0 0;font-size:15px"><a href="${SITE_URL}/inbox" style="color:#222">${escapeHtml(line)}</a></p>`);
    text.push(`${line} ${SITE_URL}/inbox`, "");
  }
  const footer = `You get this once a week. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#666">Stop the weekly digest</a> or change it in <a href="${SETTINGS_URL}" style="color:#666">your settings</a>.`;
  const html = shell({ bodyHtml: `${sections.join("")}${button(SITE_URL, "Open your shelf")}<p style="margin:20px 0 0;font-size:16px">Tony<br>ComixCatalog</p>`, footerHtml: footer });
  text.push(`Open your shelf: ${SITE_URL}`, "", "Tony", "ComixCatalog", "", `Stop the weekly digest: ${unsubscribeUrl}`);
  const subject = wanted.length ? `${wanted.length === 1 ? "A book" : `${wanted.length} books`} from your wantlist ${wanted.length === 1 ? "is" : "are"} for sale` : "Your week on ComixCatalog";
  return { subject, html, text: text.join("\n") };
}

// One digest per member per ISO week: "digest-2026-w47".
export function digestCampaign(date = new Date()) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day - yearStart) / 86_400_000 + 1) / 7);
  return `digest-${day.getUTCFullYear()}-w${String(week).padStart(2, "0")}`;
}
