"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution } from "@/lib/attribution";

// Records where a visitor came from on whatever page they land on (first
// touch, see src/lib/attribution.js). Renders nothing.
export default function AttributionCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureAttribution();
  }, [pathname]);
  return null;
}
