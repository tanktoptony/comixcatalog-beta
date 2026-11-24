// First-touch campaign attribution for the acquisition funnel
// (Instagram → /start → signup → first comic added).
//
// GA4 already reads utm_* off page_location for session attribution, so
// this is not a second analytics system. It exists for the two places GA
// alone loses the thread:
//
//   1. Email confirmation. A visitor who signs up inside Instagram's in-app
//      browser confirms from their mail app, which opens a different browser
//      with a different GA client id and empty localStorage. Anything we want
//      to know about where that account came from has to travel on the
//      account itself, so signup copies this onto Supabase user_metadata.
//   2. Activation events that happen sessions later (the first comic added
//      tomorrow). Those events carry the stored source as params.
//
// What is stored is campaign metadata only: utm values, an optional ?ref=
// username, the landing path and a timestamp. No email, no user id, nothing
// typed by the visitor.
//
// ?ref=<username> and the /join/<username> invite link name the member who sent
// someone here. /api/invites/accept reads it after signup to set
// profiles.invited_by and follow the inviter.
//
// Every signup should save a source. A tagged link supplies its own; a visit
// with only a referrer gets one from the host (bing.com is source=bing,
// medium=organic); an invite is source=invite; a visit with neither is
// source=direct, medium=none. A null signup_source now means nothing was
// recorded at all: an account older than this code, or blocked storage.

const STORAGE_KEY = "cc:attribution";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const UTM_KEYS = ["source", "medium", "campaign", "content"];
const VALUE_RE = /^[a-z0-9_.-]{1,64}$/;
const REF_RE = /^[a-z0-9_]{3,20}$/;

function clean(value, re) {
  const v = String(value ?? "").trim().toLowerCase();
  return re.test(v) ? v : null;
}

const INVITE_TAGS = Object.freeze({ source: "invite", medium: "referral", campaign: "member-invite" });

// The invite link is /join/<username> with no tags on it, so the path is the
// signal. Without this, a visitor arriving from any referrer (webmail, a DM)
// keeps that referrer as first touch and the ?ref= on the signup button that
// follows is thrown away, losing both the credit and the follow.
export function inviteRefFromPath(pathname) {
  const match = String(pathname ?? "").match(/^[/]join[/]([^/]+)[/]?$/);
  return match ? clean(match[1], REF_RE) : null;
}

// Pure: URLSearchParams (or anything with .get) → attribution object, or
// null when the URL carries no campaign signal at all. Values that do not
// look like campaign slugs are dropped rather than stored, so a crafted URL
// cannot plant arbitrary text in someone's account metadata.
export function parseAttribution(params, landingPath = "/", now = Date.now()) {
  if (!params || typeof params.get !== "function") return null;
  const out = {};
  for (const key of UTM_KEYS) {
    const v = clean(params.get(`utm_${key}`), VALUE_RE);
    if (v) out[key] = v;
  }
  const ref = clean(params.get("ref"), REF_RE) || inviteRefFromPath(landingPath);
  if (ref) out.ref = ref;
  if (Object.keys(out).length === 0) return null;
  if (ref && !out.source) Object.assign(out, { ...INVITE_TAGS, ...out });
  const path = String(landingPath || "/");
  out.landing = path.startsWith("/") ? path.slice(0, 64) : "/";
  out.ts = now;
  return out;
}

// Takes a full URL (document.referrer) or a bare host. The browser stores the
// already-cleaned host ("bing.com"), and the server cleans that saved value
// again; new URL("bing.com") throws, which silently dropped every referrer
// before it reached profiles.signup_referrer_host.
export function cleanReferrerHost(value) {
  if (!value) return null;
  const raw = String(value).trim();
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9.-]{1,253}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

const SEARCH_ENGINES = [
  ["google", /^(www[.]|m[.]|images[.]|news[.]|cse[.])?google[.][a-z.]+$/],
  ["google", /googlequicksearchbox$/], // the Android search app's android-app:// referrer
  ["bing", /(^|[.])bing[.]com$/],
  ["duckduckgo", /(^|[.])duckduckgo[.]com$/],
  ["yahoo", /(^|[.])yahoo[.][a-z.]+$/],
  ["brave", /^search[.]brave[.]com$/],
  ["ecosia", /(^|[.])ecosia[.]org$/],
  ["kagi", /(^|[.])kagi[.]com$/],
  ["startpage", /(^|[.])startpage[.]com$/],
  ["qwant", /(^|[.])qwant[.]com$/],
  ["yandex", /(^|[.])yandex[.][a-z.]+$/],
  ["baidu", /(^|[.])baidu[.]com$/],
];

// Named so a bare instagram.com referrer and a tagged Instagram link land in the
// same place in the Monday email. YouTube is medium=video to match the /yt links.
const NAMED_SITES = [
  ["instagram", "social", /(^|[.])instagram[.]com$/],
  ["facebook", "social", /(^|[.])(facebook|messenger)[.]com$|^fb[.]com$/],
  ["reddit", "social", /(^|[.])reddit[.]com$/],
  ["x", "social", /^t[.]co$|(^|[.])(x|twitter)[.]com$/],
  ["threads", "social", /(^|[.])threads[.](net|com)$/],
  ["tiktok", "social", /(^|[.])tiktok[.]com$/],
  ["pinterest", "social", /(^|[.])pinterest[.][a-z.]+$/],
  ["bluesky", "social", /^bsky[.]app$/],
  ["discord", "social", /(^|[.])discord[.]com$/],
  ["youtube", "video", /(^|[.])youtube[.]com$|^youtu[.]be$/],
];

// Pure: which source a referrer counts as, or null for no referrer or our own site.
export function classifyReferrer(host) {
  const h = cleanReferrerHost(host);
  if (!h || /(^|[.])comixcatalog[.]com$/.test(h)) return null;
  for (const [source, re] of SEARCH_ENGINES) if (re.test(h)) return { source, medium: "organic" };
  for (const [source, medium, re] of NAMED_SITES) if (re.test(h)) return { source, medium };
  return { source: clean(h, VALUE_RE) || "other-site", medium: "referral" };
}

// Pure: fills in a source for a record that has none. Tags on a link always win,
// so this only ever adds to what the visitor's URL said.
function withSource(record) {
  if (record.source) return record;
  const derived = clean(record.ref, REF_RE)
    ? INVITE_TAGS
    : classifyReferrer(record.referrer_host) || (record.direct ? { source: "direct", medium: "none" } : null);
  return derived ? { ...derived, ...record } : record;
}

// Revalidate the user-writable metadata before it crosses the server boundary.
// The source is worked out here as well as in the browser, because a record
// saved in localStorage or on an unconfirmed account before this code shipped
// has only the referrer.
export function sanitizeSavedAttribution(record) {
  if (!record || typeof record !== "object") return {};
  const params = new URLSearchParams();
  for (const key of UTM_KEYS) if (record[key]) params.set(`utm_${key}`, record[key]);
  const cleanRecord = parseAttribution(params, "/", Date.now()) || {};
  const tags = {
    ...(cleanRecord.source ? { source: cleanRecord.source } : {}),
    ...(cleanRecord.medium ? { medium: cleanRecord.medium } : {}),
    ...(cleanRecord.campaign ? { campaign: cleanRecord.campaign } : {}),
    ...(clean(record.ref, REF_RE) ? { ref: clean(record.ref, REF_RE) } : {}),
    ...(cleanReferrerHost(record.referrer_host) ? { referrer_host: cleanReferrerHost(record.referrer_host) } : {}),
  };
  // An empty body (an account with nothing recorded) saves nothing. Writing a
  // default landing path would use up the one write this row gets.
  if (Object.keys(tags).length === 0 && !record.landing && record.direct !== true) return {};
  const { direct, ...saved } = withSource({ ...tags, ...(record.direct === true ? { direct: true } : {}) });
  const landing = String(record.landing || "/");
  return { ...saved, landing_path: landing.startsWith("/") ? landing.slice(0, 64) : "/" };
}

// Pure: is a stored record still usable?
export function isFresh(record, now = Date.now()) {
  return Boolean(record && Number.isFinite(record.ts) && now - record.ts < MAX_AGE_MS);
}

function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// First touch wins: an existing fresh record is kept, so a visitor who came
// from Instagram and later clicks a newsletter link is still credited to
// Instagram. Returns whichever record is now in effect.
// Pure: which record should be kept? A fresh record with a real signal
// (campaign, ref or outside referrer) is never replaced: first touch wins.
// A "direct" record (no signal, kept only for its landing page) gives way
// to the first visit that does carry a signal, so typing the URL once does
// not hide a later Instagram click for 30 days.
export function chooseAttribution(existing, incoming, now = Date.now()) {
  const keep = isFresh(existing, now) ? existing : null;
  if (keep && !keep.direct) {
    // First touch keeps the credit, but a member's invite still has to reach
    // signup, or the new account never follows them or counts as invited.
    return incoming?.ref && !keep.ref ? { ...keep, ref: incoming.ref } : keep;
  }
  if (incoming && !incoming.direct) return incoming;
  return keep || incoming || null;
}

// Runs on every page (src/components/AttributionCapture.js), not just /start:
// until 2026-10-20 it ran only on /start and the invite page, so visitors who
// landed anywhere else, including the Instagram bio link's
// /founding-collectors, signed up with no source at all.
export function captureAttribution() {
  if (typeof window === "undefined") return null;
  const landing = window.location.pathname.slice(0, 64) || "/";
  let incoming = parseAttribution(new URLSearchParams(window.location.search), window.location.pathname);
  const referrerHost = cleanReferrerHost(document.referrer);
  const outside = referrerHost && referrerHost !== window.location.hostname.replace(/^www\./, "") ? referrerHost : null;
  if (!incoming && outside) incoming = { landing, ts: Date.now() };
  if (incoming && outside) incoming.referrer_host = outside;
  if (!incoming) incoming = { landing, ts: Date.now(), direct: true };
  incoming = withSource(incoming);

  const existing = read();
  const chosen = chooseAttribution(existing, incoming);
  if (chosen !== existing) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chosen));
    } catch {
      // Private mode / blocked storage: attribution is best-effort.
    }
  }
  return chosen;
}

// Restore attribution that travelled on the account (user_metadata) into
// this browser. Called by /auth/callback: the email-confirmation link opens
// a different browser than the one that signed up, so without this every
// later activation event from that browser goes out unattributed. The
// stored value is re-validated, since user_metadata is user-writable.
export function seedAttribution(record) {
  if (typeof window === "undefined" || !record || typeof record !== "object" || record.direct) return;
  // AttributionCapture has already written a direct record for this page load
  // by the time /auth/callback gets here, so a direct record must not block this.
  const current = read();
  if (isFresh(current) && !current.direct) return;
  const filled = withSource(record);
  const params = new URLSearchParams();
  for (const key of UTM_KEYS) if (filled[key]) params.set(`utm_${key}`, filled[key]);
  if (filled.ref) params.set("ref", filled.ref);
  const ts = Number.isFinite(record.ts) ? record.ts : Date.now();
  const clean = parseAttribution(params, record.landing || "/", ts);
  if (!clean || !isFresh(clean)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // best-effort
  }
}

export function getAttribution() {
  if (typeof window === "undefined") return null;
  const record = read();
  return isFresh(record) ? record : null;
}

// Flat GA event params. GA4 custom params must be registered as custom
// dimensions (attr_source, attr_medium, attr_campaign) to show in reports.
// `ref` is deliberately left out: it is a username, and GA does not need to
// know who referred whom. It stays on the account's own metadata.
export function attributionParams(record = getAttribution()) {
  if (!record) return {};
  const out = {};
  if (record.source) out.attr_source = record.source;
  if (record.medium) out.attr_medium = record.medium;
  if (record.campaign) out.attr_campaign = record.campaign;
  out.attr_has_ref = Boolean(record.ref);
  return out;
}
