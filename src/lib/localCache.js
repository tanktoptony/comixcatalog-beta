// Small JSON cache in the viewer's own browser (localStorage), for data that
// is slow to load but cheap to show slightly stale: a signed-in user's
// library list and the catalog details for its books. Pages render from
// here instantly and refresh from the server in the background.
//
// Everything here is best effort. localStorage can be missing, full or
// blocked (private windows, strict browser settings), so every call swallows
// errors and a read that fails is just a cache miss.
//
// Keys are namespaced and versioned; bump VERSION when a stored shape
// changes so old entries are ignored rather than misread.

const VERSION = "v1";
const PREFIX = `cc:${VERSION}:`;

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLocal(key) {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

// Returns false if it could not be stored (quota, blocked). A failed write
// also removes any older copy, so a stale entry is never left behind.
export function writeLocal(key, value) {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    try {
      s.removeItem(PREFIX + key);
    } catch {
      // nothing more to do
    }
    return false;
  }
}

// Remove every entry whose key starts with `prefix` (e.g. "library:" on
// sign-out, so the next person on a shared computer never sees it).
export function clearLocalPrefix(prefix) {
  const s = storage();
  if (!s) return;
  try {
    const doomed = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX + prefix)) doomed.push(k);
    }
    doomed.forEach((k) => s.removeItem(k));
  } catch {
    // best effort
  }
}
