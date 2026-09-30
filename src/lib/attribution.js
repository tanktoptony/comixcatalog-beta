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
// ?ref=<username> is captured and stored but nothing acts on it yet. It is
// here so share links can carry it today and a referral credit can be built
// on real data later, without changing any link already posted.

const STORAGE_KEY = "cc:attribution";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const UTM_KEYS = ["source", "medium", "campaign", "content"];
const VALUE_RE = /^[a-z0-9_.-]{1,64}$/;
const REF_RE = /^[a-z0-9_]{3,20}$/;

function clean(value, re) {
  const v = String(value ?? "").trim().toLowerCase();
  return re.test(v) ? v : null;
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
  const ref = clean(params.get("ref"), REF_RE);
  if (ref) out.ref = ref;
  if (Object.keys(out).length === 0) return null;
  const path = String(landingPath || "/");
  out.landing = path.startsWith("/") ? path.slice(0, 64) : "/";
  out.ts = now;
  return out;
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
export function captureAttribution() {
  if (typeof window === "undefined") return null;
  const existing = read();
  if (isFresh(existing)) return existing;
  const next = parseAttribution(
    new URLSearchParams(window.location.search),
    window.location.pathname
  );
  if (!next) return null;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / blocked storage: attribution is best-effort.
  }
  return next;
}

// Restore attribution that travelled on the account (user_metadata) into
// this browser. Called by /auth/callback: the email-confirmation link opens
// a different browser than the one that signed up, so without this every
// later activation event from that browser goes out unattributed. The
// stored value is re-validated, since user_metadata is user-writable.
export function seedAttribution(record) {
  if (typeof window === "undefined" || !record || typeof record !== "object") return;
  if (isFresh(read())) return;
  const params = new URLSearchParams();
  for (const key of UTM_KEYS) if (record[key]) params.set(`utm_${key}`, record[key]);
  if (record.ref) params.set("ref", record.ref);
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
