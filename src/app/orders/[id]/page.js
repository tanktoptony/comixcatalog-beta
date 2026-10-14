import { Suspense } from "react";
import OrderStatus from "@/components/OrderStatus";

export default async function OrderPage({ params }) {
  const { id } = await params;
  return (
    <Suspense fallback={<main className="order-page"><p>Loading order...</p></main>}>
      <OrderStatus id={id} />
    </Suspense>
  );
}
