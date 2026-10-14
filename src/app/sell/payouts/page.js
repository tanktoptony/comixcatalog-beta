import { Suspense } from "react";
import PayoutsClient from "./PayoutsClient";

export const metadata = { title: "Seller payouts" };

// PayoutsClient reads ?return=1 with useSearchParams, which needs a Suspense
// boundary or the static prerender fails the build.
export default function PayoutsPage() {
  return (
    <Suspense fallback={null}>
      <PayoutsClient />
    </Suspense>
  );
}
