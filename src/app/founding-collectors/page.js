import FoundingCollectorsClient from "@/components/FoundingCollectorsClient";
import { getFoundingRemaining } from "@/lib/foundingStatus";
import { getFoundingRoster } from "@/lib/foundingRoster";

export const metadata = {
  title: "Founding Collectors",
  description:
    "The first 100 collectors on ComixCatalog get Collector Pro for life, free, and a permanent place on the Roll of Honor.",
};

// The count and the Roll of Honor are server-rendered (both cached a
// minute) so the page is right on first paint; the client refreshes the
// count and handles claiming.
export default async function FoundingCollectorsPage() {
  const [initialRemaining, roster] = await Promise.all([
    getFoundingRemaining(),
    getFoundingRoster().catch((err) => {
      console.error("founding roster failed:", err);
      return [];
    }),
  ]);
  return <FoundingCollectorsClient initialRemaining={initialRemaining} roster={roster} />;
}
