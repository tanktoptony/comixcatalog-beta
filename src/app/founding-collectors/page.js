import FoundingCollectorsClient from "@/components/FoundingCollectorsClient";
import { getFoundingRemaining } from "@/lib/foundingStatus";
import { getFoundingRoster } from "@/lib/foundingRoster";

export const metadata = {
  title: "Founding Collectors",
  description:
    "The first 100 collectors on ComixCatalog get a lifetime membership, free, and a permanent place on the Roll of Honor.",
};

// The count and the Roll of Honor are server-rendered (both cached a
// minute) so the page is right on first paint; the client refreshes the
// count and handles claiming.
export default async function FoundingCollectorsPage({ searchParams }) {
  const query = await searchParams;
  const initialMessage = query?.claimed === "1"
    ? "You're in. Founding Collector pass claimed."
    : query?.claim === "soldout"
      ? "All 100 passes were claimed before you confirmed."
      : query?.claim === "sent"
        ? "Check your email to claim your founding pass. It's first come, first served, so confirm soon."
      : query?.claim === "invalid" || query?.claim === "expired"
        ? "That link has expired or was already used. Claim again below."
        : "";
  const [initialRemaining, roster] = await Promise.all([
    getFoundingRemaining(),
    getFoundingRoster().catch((err) => {
      console.error("founding roster failed:", err);
      return [];
    }),
  ]);
  return <FoundingCollectorsClient initialRemaining={initialRemaining} roster={roster} initialMessage={initialMessage} />;
}
