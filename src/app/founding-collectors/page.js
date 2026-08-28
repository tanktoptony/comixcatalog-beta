import FoundingCollectorsClient from "@/components/FoundingCollectorsClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://comixcatalog.com";

// Server-rendered for the same reason as the layout's FoundingBanner fetch
// (see layout.js): fetch fresh per request (cache: "no-store") so the
// headline number is correct on first paint instead of a hardcoded guess
// that flashes to the real count once the client takes over.
async function getInitialRemaining() {
  try {
    const res = await fetch(`${SITE_URL}/api/founding/status`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return Number.isFinite(data?.remaining) ? data.remaining : null;
  } catch {
    return null;
  }
}

export default async function FoundingCollectorsPage() {
  const initialRemaining = await getInitialRemaining();
  return <FoundingCollectorsClient initialRemaining={initialRemaining} />;
}
