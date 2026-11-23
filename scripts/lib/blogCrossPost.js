// Pure rules for cross-posting a published blog post to Instagram, the
// Facebook Page and Patreon. scripts/crossPostBlog.js does the I/O.
//
// Patreon has no API for creating posts, so its "post" is an email to Tony
// with the text ready to paste. Instagram and Facebook post on their own.

export const CHANNELS = Object.freeze(["instagram", "facebook", "patreon"]);

// Posts published before this are never cross-posted: the feature started
// here, and older posts already had their Instagram turn in the weekly slot.
export const CROSSPOST_SINCE = "2026-11-23T00:00:00Z";

// A post that couldn't go out (Facebook permission missing, an outage) keeps
// retrying for this long, then gives up so an old post never lands late.
export const CROSSPOST_WINDOW_DAYS = 7;

const HASHTAGS = "#comiccollecting #comicbookcollector #comixcatalog";

export function postUrl(siteUrl, slug) {
  return `${siteUrl.replace(/\/$/, "")}/blog/${slug}`;
}

// Ledger keys. Instagram reuses the bot's own key, so the weekly brand slot
// never posts the same blog post a second time.
export function ledgerKey(channel, slug) {
  if (channel === "instagram") return `brand:blog:${slug}`;
  return `${channel}:blog:${slug}`;
}

export function isInWindow(publishedAt, now = new Date()) {
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return false;
  if (t < new Date(CROSSPOST_SINCE).getTime()) return false;
  return now.getTime() - t <= CROSSPOST_WINDOW_DAYS * 86400000;
}

// Which channels still need this post. `posted` is a Set of ledger keys
// (the Instagram ledger and the cross-post ledger merged).
export function pendingChannels(post, posted, now = new Date()) {
  if (!post?.slug || !isInWindow(post.published_at, now)) return [];
  return CHANNELS.filter((channel) => !posted.has(ledgerKey(channel, post.slug)));
}

// Instagram doesn't make caption links clickable, so it points at the bio.
export function instagramCaption(post) {
  return [post.title, "", post.excerpt, "", "New on the ComixCatalog blog. Link in bio.", HASHTAGS]
    .filter((line) => line !== undefined && line !== null)
    .join("\n");
}

// Facebook makes links clickable and builds a preview from the URL.
export function facebookMessage(post, siteUrl) {
  return [post.title, "", post.excerpt, "", `Read it: ${postUrl(siteUrl, post.slug)}`]
    .filter((line) => line !== undefined && line !== null)
    .join("\n");
}

export function patreonPost(post, siteUrl) {
  return {
    title: post.title,
    body: [
      post.excerpt,
      "",
      `The full post is up on the blog: ${postUrl(siteUrl, post.slug)}`,
      "",
      "Thank you for backing ComixCatalog. It's what keeps this going.",
    ].join("\n"),
  };
}

const escapeHtml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The email to Tony: Patreon text to paste, the card to attach, and what
// happened on Instagram and Facebook so one email covers the whole post.
export function patreonEmail({ post, siteUrl, imageUrl, results = {} }) {
  const { title, body } = patreonPost(post, siteUrl);
  const status = Object.entries(results)
    .map(([channel, text]) => `<li><b>${escapeHtml(channel)}:</b> ${escapeHtml(text)}</li>`)
    .join("");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;line-height:1.5;color:#111">
<p>"${escapeHtml(post.title)}" is live. Paste this into a new Patreon post:</p>
<p><b>Title</b></p>
<pre style="white-space:pre-wrap;background:#f4f4f4;padding:12px;border-radius:6px;font:15px/1.5 system-ui,sans-serif">${escapeHtml(title)}</pre>
<p><b>Text</b></p>
<pre style="white-space:pre-wrap;background:#f4f4f4;padding:12px;border-radius:6px;font:15px/1.5 system-ui,sans-serif">${escapeHtml(body)}</pre>
<p><b>Image</b> (save it and add it to the post):<br><a href="${escapeHtml(imageUrl)}"><img src="${escapeHtml(imageUrl)}" alt="" width="300" style="border-radius:6px"></a></p>
<p><a href="https://www.patreon.com/comixcatalog">Open Patreon</a></p>
${status ? `<p><b>Also posted</b></p><ul>${status}</ul>` : ""}
</div>`;
  return { subject: `Patreon post ready: ${post.title}`, html };
}

// Facebook answers a missing permission with error code 200 or 10 and names
// the permission. That isn't an outage: Tony has to regenerate the token.
export function isMissingPermission(fbError) {
  const code = Number(fbError?.code);
  return (code === 200 || code === 10) && /pages_manage_posts|permission/i.test(String(fbError?.message ?? ""));
}
