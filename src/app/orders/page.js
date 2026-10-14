import { Suspense } from "react";
import OrdersList from "@/components/OrdersList";

export default function OrdersPage() {
  return (
    <Suspense fallback={<main><p>Loading orders...</p></main>}>
      <OrdersList />
    </Suspense>
  );
}
