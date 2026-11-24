// First-touch campaign attribution (Instagram funnel).
//
// Run: npm run test:attribution

import test from "node:test";
import assert from "node:assert/strict";

import { parseAttribution, isFresh, attributionParams, seedAttribution, sanitizeSavedAttribution, chooseAttribution, cleanReferrerHost, captureAttribution, getAttribution } from "./attribution.js";

const qs = (s) => new URLSearchParams(s);
const NOW = 1_800_000_000_000;

test("reads the Instagram bio link's utm params", () => {
  const a = parseAttribution(
    qs("utm_source=instagram&utm_medium=social&utm_campaign=profile"),
    "/start",
    NOW
  );
  assert.deepEqual(a, {
    source: "instagram",
    medium: "social",
    campaign: "profile",
    landing: "/start",
    ts: NOW,
  });
});

test("no campaign signal means nothing is stored", () => {
  assert.equal(parseAttribution(qs(""), "/start", NOW), null);
  assert.equal(parseAttribution(qs("q=x-men"), "/start", NOW), null);
});

test("values are normalised to lowercase slugs", () => {
  const a = parseAttribution(qs("utm_source=Instagram"), "/start", NOW);
  assert.equal(a.source, "instagram");
});

test("values that are not campaign slugs are dropped, not stored", () => {
  // These end up in the account's user_metadata, so free text is refused.
  const a = parseAttribution(
    qs("utm_source=instagram&utm_campaign=<script>alert(1)</script>&utm_medium=" + "x".repeat(200)),
    "/start",
    NOW
  );
  assert.deepEqual(Object.keys(a).sort(), ["landing", "source", "ts"]);
});

test("ref is kept only when it is a valid username", () => {
  assert.equal(parseAttribution(qs("ref=tony_c"), "/start", NOW).ref, "tony_c");
  assert.equal(parseAttribution(qs("ref=no spaces allowed"), "/start", NOW), null);
  assert.equal(parseAttribution(qs("ref=ab"), "/start", NOW), null);
});

test("records expire after 30 days", () => {
  assert.equal(isFresh({ ts: NOW - 29 * 864e5 }, NOW), true);
  assert.equal(isFresh({ ts: NOW - 31 * 864e5 }, NOW), false);
  assert.equal(isFresh(null, NOW), false);
  assert.equal(isFresh({}, NOW), false);
});

test("GA params never carry the referrer's username", () => {
  const p = attributionParams({ source: "instagram", medium: "story", campaign: "share_card", ref: "tony_c" });
  assert.deepEqual(p, {
    attr_source: "instagram",
    attr_medium: "story",
    attr_campaign: "share_card",
    attr_has_ref: true,
  });
  assert.ok(!JSON.stringify(p).includes("tony_c"));
});

test("no record means no params", () => {
  assert.deepEqual(attributionParams(null), {});
});

test("saved attribution sanitizes the referrer and preserves valid referral usernames", () => {
  assert.deepEqual(sanitizeSavedAttribution({
    source: "Instagram", landing: "/start", referrer_host: "https://Reddit.com/u/collector?ref=tony_c", ref: "tony_c",
  }), { source: "instagram", ref: "tony_c", referrer_host: "reddit.com", landing_path: "/start" });
});

// What the browser actually saves is the bare host, not a URL (seen on three
// real signups from Bing and DuckDuckGo, 2026-10-24 to 10-26).
test("saved attribution keeps a bare referrer host", () => {
  assert.deepEqual(sanitizeSavedAttribution({ ts: 1, landing: "/", referrer_host: "bing.com" }),
    { source: "bing", medium: "organic", referrer_host: "bing.com", landing_path: "/" });
  assert.equal(cleanReferrerHost("noai.duckduckgo.com"), "noai.duckduckgo.com");
  assert.equal(cleanReferrerHost("not a host"), null);
  assert.equal(cleanReferrerHost("javascript:alert(1)"), null);
});

// seedAttribution runs in the browser (/auth/callback). Stand in a minimal
// window + localStorage.
function withFakeStorage(run) {
  const prior = globalThis.window;
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  try {
    run(store);
  } finally {
    if (prior === undefined) delete globalThis.window;
    else globalThis.window = prior;
  }
}

test("seedAttribution restores the account's attribution in a fresh browser", () => {
  withFakeStorage((store) => {
    seedAttribution({ source: "instagram", medium: "social", campaign: "profile", landing: "/start", ts: Date.now() });
    const saved = JSON.parse(store.get("cc:attribution"));
    assert.equal(saved.source, "instagram");
    assert.equal(saved.campaign, "profile");
  });
});

test("seedAttribution never overwrites a fresh first touch", () => {
  withFakeStorage((store) => {
    store.set("cc:attribution", JSON.stringify({ source: "newsletter", ts: Date.now() }));
    seedAttribution({ source: "instagram", ts: Date.now() });
    assert.equal(JSON.parse(store.get("cc:attribution")).source, "newsletter");
  });
});

test("seedAttribution re-validates tampered metadata", () => {
  // user_metadata is user-writable, so it is parsed like a URL again.
  withFakeStorage((store) => {
    seedAttribution({ source: "<img src=x onerror=alert(1)>", ts: Date.now() });
    assert.equal(store.has("cc:attribution"), false);
    seedAttribution({ source: "instagram", ts: Date.now() - 40 * 864e5 });
    assert.equal(store.has("cc:attribution"), false);
  });
});

test("a direct visit is recorded but gives way to the first real campaign", () => {
  const now = Date.now();
  const direct = { landing: "/series/1", ts: now - 1000, direct: true };
  const instagram = { source: "instagram", landing: "/founding-collectors", ts: now };
  assert.equal(chooseAttribution(null, direct, now), direct);
  assert.equal(chooseAttribution(direct, instagram, now), instagram);
  assert.equal(chooseAttribution(direct, { landing: "/", ts: now, direct: true }, now), direct);
});

test("a campaign record is never replaced while fresh, and an expired one is", () => {
  const now = Date.now();
  const instagram = { source: "instagram", landing: "/", ts: now - 1000 };
  const newsletter = { source: "newsletter", landing: "/", ts: now };
  assert.equal(chooseAttribution(instagram, newsletter, now), instagram);
  assert.equal(chooseAttribution(instagram, { landing: "/", ts: now, direct: true }, now), instagram);
  const stale = { ...instagram, ts: now - 31 * 24 * 60 * 60 * 1000 };
  assert.equal(chooseAttribution(stale, newsletter, now), newsletter);
});

// End to end, in the order a real visitor does it: land on a page, browse, sign
// up on a later page. What the signup page reads rides on the account as JSON
// and comes back through the same sanitizer /api/attribution uses to write
// profiles.signup_*. Until November 2026 a visit with only a search referrer
// saved no source, so every search signup showed as "unknown".
function browser() {
  const store = new Map();
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  globalThis.window = {
    location: { pathname: "/", search: "", hostname: "www.comixcatalog.com" },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  globalThis.document = { referrer: "" };
  return {
    store,
    visit(url, referrer = "") {
      const u = new URL(url, "https://www.comixcatalog.com");
      globalThis.window.location.pathname = u.pathname;
      globalThis.window.location.search = u.search;
      globalThis.document.referrer = referrer;
      captureAttribution();
    },
    // What /signup puts in user_metadata and /auth/callback posts to the route.
    savedAtSignup() {
      return sanitizeSavedAttribution(JSON.parse(JSON.stringify(getAttribution())));
    },
    close() {
      if (priorWindow === undefined) delete globalThis.window;
      else globalThis.window = priorWindow;
      if (priorDocument === undefined) delete globalThis.document;
      else globalThis.document = priorDocument;
    },
  };
}
const SITE = "https://www.comixcatalog.com";
const journey = (run) => {
  const b = browser();
  try {
    return run(b);
  } finally {
    b.close();
  }
};

test("a search visit saves a source after browsing and signing up on a later page", () => {
  journey((b) => {
    b.visit("/series/abc", "https://www.bing.com/search?q=milk+and+cheese+comic");
    b.visit("/issue/gcd-1", `${SITE}/series/abc`);
    b.visit("/search?q=hellboy", `${SITE}/issue/gcd-1`);
    b.visit("/signup", `${SITE}/search?q=hellboy`);
    assert.deepEqual(b.savedAtSignup(), {
      source: "bing",
      medium: "organic",
      referrer_host: "bing.com",
      landing_path: "/series/abc",
    });
  });
});

test("a tagged visit saves its tags after browsing and signing up on a later page", () => {
  journey((b) => {
    b.visit("/founding-collectors?utm_source=youtube&utm_medium=video&utm_campaign=yt-doom", "https://www.youtube.com/");
    b.visit("/start", `${SITE}/founding-collectors`);
    b.visit("/signup", `${SITE}/start`);
    assert.deepEqual(b.savedAtSignup(), {
      source: "youtube",
      medium: "video",
      campaign: "yt-doom",
      referrer_host: "youtube.com",
      landing_path: "/founding-collectors",
    });
  });
});

test("a visit with no tag and no referrer saves source=direct, and gives way to a later search", () => {
  journey((b) => {
    b.visit("/");
    b.visit("/signup", `${SITE}/`);
    assert.deepEqual(b.savedAtSignup(), { source: "direct", medium: "none", landing_path: "/" });
    b.visit("/series/abc", "https://duckduckgo.com/");
    assert.equal(b.savedAtSignup().source, "duckduckgo");
  });
});

test("a search visit keeps the credit when a tagged link comes later", () => {
  journey((b) => {
    b.visit("/series/abc", "https://www.google.com/");
    b.visit("/founding-collectors?utm_source=instagram&utm_medium=social&utm_campaign=vs-bio", "https://l.instagram.com/");
    const saved = b.savedAtSignup();
    assert.equal(saved.source, "google");
    assert.equal(saved.landing_path, "/series/abc");
  });
});

test("internal navigation never counts as a referrer, with or without www", () => {
  journey((b) => {
    b.visit("/", "https://comixcatalog.com/series/abc");
    assert.deepEqual(b.savedAtSignup(), { source: "direct", medium: "none", landing_path: "/" });
  });
});

test("a record saved before this code shipped still gets a source when it is saved", () => {
  // The exact shape on the Oct 24 to 26 signups' auth metadata, which is also
  // what sits in localStorage for up to 30 days.
  assert.deepEqual(sanitizeSavedAttribution({ ts: 1793022045527, landing: "/contribute/guidelines", referrer_host: "noai.duckduckgo.com" }),
    { source: "duckduckgo", medium: "organic", referrer_host: "noai.duckduckgo.com", landing_path: "/contribute/guidelines" });
  assert.deepEqual(sanitizeSavedAttribution({ ts: 1, landing: "/series/abc", direct: true }),
    { source: "direct", medium: "none", landing_path: "/series/abc" });
});

test("referrers are grouped by who sent the visit, not by the exact hostname", () => {
  const cases = {
    "https://www.google.com/": ["google", "organic"],
    "https://www.google.co.uk/": ["google", "organic"],
    "android-app://com.google.android.googlequicksearchbox/": ["google", "organic"],
    "https://cn.bing.com/": ["bing", "organic"],
    "https://noai.duckduckgo.com/": ["duckduckgo", "organic"],
    "https://search.yahoo.com/": ["yahoo", "organic"],
    "https://search.brave.com/": ["brave", "organic"],
    "https://l.instagram.com/": ["instagram", "social"],
    "https://lm.facebook.com/": ["facebook", "social"],
    "https://old.reddit.com/r/comicbookcollecting": ["reddit", "social"],
    "https://t.co/abc": ["x", "social"],
    "https://m.youtube.com/": ["youtube", "video"],
    // Not search: Google's other products and everyone else are plain referrals.
    "https://mail.google.com/": ["mail.google.com", "referral"],
    "https://leagueofcomicgeeks.com/forum": ["leagueofcomicgeeks.com", "referral"],
  };
  for (const [referrer, [source, medium]] of Object.entries(cases)) {
    journey((b) => {
      b.visit("/", referrer);
      const saved = b.savedAtSignup();
      assert.equal(saved.source, source, referrer);
      assert.equal(saved.medium, medium, referrer);
    });
  }
});

// The invite link is /join/<username>, with no tags on it.
const INVITE_BUTTON = "/signup?ref=tony_c&utm_source=invite&utm_medium=referral&utm_campaign=member-invite&next=%2Fpeople%3Fwelcome%3D1";

test("an invite link with no referrer saves source=invite and the inviter", () => {
  journey((b) => {
    b.visit("/join/tony_c");
    b.visit(INVITE_BUTTON, `${SITE}/join/tony_c`);
    const stored = getAttribution();
    assert.equal(stored.ref, "tony_c");
    assert.deepEqual(b.savedAtSignup(), {
      source: "invite",
      medium: "referral",
      campaign: "member-invite",
      ref: "tony_c",
      landing_path: "/join/tony_c",
    });
  });
});

test("an invite link opened from webmail still counts as the invite", () => {
  // Used to keep mail.google.com as first touch and drop ?ref= on the button.
  journey((b) => {
    b.visit("/join/tony_c", "https://mail.google.com/");
    b.visit(INVITE_BUTTON, `${SITE}/join/tony_c`);
    assert.deepEqual(b.savedAtSignup(), {
      source: "invite",
      medium: "referral",
      campaign: "member-invite",
      ref: "tony_c",
      referrer_host: "mail.google.com",
      landing_path: "/join/tony_c",
    });
  });
});

test("someone who found us first and is invited later keeps the first source and the inviter", () => {
  journey((b) => {
    b.visit("/series/abc", "https://www.bing.com/");
    b.visit("/join/tony_c");
    b.visit(INVITE_BUTTON, `${SITE}/join/tony_c`);
    const saved = b.savedAtSignup();
    assert.equal(saved.source, "bing");
    assert.equal(saved.ref, "tony_c");
    assert.equal(saved.landing_path, "/series/abc");
  });
});

test("only a real /join/<username> path counts as an invite", () => {
  journey((b) => {
    b.visit("/join");
    assert.equal(b.savedAtSignup().source, "direct");
    assert.equal(getAttribution().ref, undefined);
  });
  journey((b) => {
    b.visit("/join/not valid!");
    assert.equal(b.savedAtSignup().source, "direct");
  });
});

test("an empty body saves nothing, not a made-up landing page", () => {
  // /auth/callback posts {} for an account with nothing recorded. The route's
  // write-once guard would then lock in landing "/" for good.
  assert.deepEqual(sanitizeSavedAttribution({}), {});
});

test("seedAttribution restores the account's source over a direct record just written", () => {
  // AttributionCapture runs on /auth/callback before the callback's own code,
  // so in a fresh browser a direct record is always there first.
  journey((b) => {
    b.visit("/auth/callback");
    seedAttribution({ source: "instagram", medium: "social", campaign: "vs-bio", landing: "/founding-collectors", ts: Date.now() });
    assert.equal(getAttribution().source, "instagram");
    assert.equal(attributionParams().attr_campaign, "vs-bio");
  });
});

test("seedAttribution restores a search source from the referrer", () => {
  journey((b) => {
    b.visit("/auth/callback");
    seedAttribution({ landing: "/series/abc", referrer_host: "bing.com", ts: Date.now() });
    assert.equal(getAttribution().source, "bing");
  });
});
