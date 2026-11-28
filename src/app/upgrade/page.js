import { redirect } from "next/navigation";
import UpgradeClient from "./UpgradeClient";
import { MEMBERSHIP_SALES_OPEN } from "@/lib/membershipSales";

export default function UpgradePage() {
  if (!MEMBERSHIP_SALES_OPEN) redirect("/founding-collectors");
  return <UpgradeClient />;
}
