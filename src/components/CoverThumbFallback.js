"use client";

import { useEffect } from "react";
import { coverOriginal } from "@/lib/coverThumb";

// Grids ask for a cover's small WebP thumb (src/lib/coverThumb.js). Until the
// backfill reaches every cover, some thumbs will 404; this swaps any thumb
// that fails back to its full-size original, sitewide, so no call site needs
// its own fallback.
//
// It listens in the capture phase on document, which runs before an <img>'s
// own onError, and stops the event there so a component's "show the
// placeholder" handler does not fire for a cover that does exist. If the
// original fails too, that second error has a non-thumb src and passes
// through to the component as before.
export default function CoverThumbFallback() {
  useEffect(() => {
    const swap = (img) => {
      const original = coverOriginal(img.getAttribute("src"));
      if (!original) return false;
      img.src = original;
      return true;
    };
    const onError = (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (swap(img)) event.stopImmediatePropagation();
    };
    document.addEventListener("error", onError, true);
    // Thumbs that already failed before this effect ran.
    for (const img of document.images) {
      if (img.complete && img.naturalWidth === 0) swap(img);
    }
    return () => document.removeEventListener("error", onError, true);
  }, []);
  return null;
}
