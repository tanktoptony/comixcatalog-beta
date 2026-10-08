// Server-only pieces shared by the /api/admin/production-assets routes.

import { getServiceClient } from "./supabase/service.js";
import { requireAdmin } from "@/lib/adminAuth";
import { GET as issueRouteGET } from "@/app/api/issues/[id]/route";

export function serviceClient() {
  return getServiceClient();
}

// Same gate as every admin write: the admin account with a two-factor (aal2) session.
// Returns null when the caller may proceed, or the refusal response to send.
export async function adminRefusal(req) {
  const { response } = await requireAdmin(req);
  return response ?? null;
}

const PUBLIC_PREFIX = () =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/`;

// Which cover does the site show for this issue? Asked of the issue page's own
// API handler, called in-process, rather than re-implemented here. That route
// owns the ID-path / title-path / year-span rules (and the decision to show an
// honest blank rather than a borrowed cover), so a video asset can never
// disagree with what /issue/<id> renders. No Authorization header is passed,
// so it does no viewer-specific work.
export async function lookupIssue(issueId) {
  const res = await issueRouteGET(
    new Request(`http://internal/api/issues/${encodeURIComponent(issueId)}`),
    { params: Promise.resolve({ id: issueId }) }
  );
  if (!res.ok) {
    return { ok: false, error: `issue route returned ${res.status}` };
  }
  const { issue } = await res.json();
  const cover = issue?.cover ?? null;
  const prefix = PUBLIC_PREFIX();
  const storagePath = cover && cover.startsWith(prefix)
    ? decodeURIComponent(cover.slice(prefix.length))
    : null;
  return {
    ok: true,
    issueId,
    seriesId: issue?.series_id ?? null,
    seriesTitle: issue?.series_title ?? null,
    seriesFormat: issue?.series_format ?? null,
    issueNumber: issue?.issue_number ?? null,
    year: issue?.release_year ?? null,
    publisher: issue?.publisher ?? null,
    cover,
    storagePath,
  };
}

// Run fn over items with at most `limit` in flight.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
