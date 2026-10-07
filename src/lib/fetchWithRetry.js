// Retry a fetch that returns a Response. Resolves with the first ok Response,
// or null once every attempt failed (non-ok status or a thrown network error)
// or isCancelled() turned true. Never throws.
//
// Added 2026-10-07: the library page asked /api/library-hydrate once per batch
// and gave up silently on any failure, so one slow DB moment left freshly
// added books as "…" stubs until a full reload.
export async function fetchWithRetry(doFetch, { delays = [1000, 3000, 8000], isCancelled = () => false, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1]);
    if (isCancelled()) return null;
    try {
      const res = await doFetch();
      if (res?.ok) return res;
    } catch {
      // network error: fall through to the next attempt
    }
  }
  return null;
}
