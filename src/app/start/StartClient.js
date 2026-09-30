"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { captureAttribution, attributionParams } from "@/lib/attribution";

// New accounts from /start land on /library, which renders FirstRunLibrary
// (search box + popular series) for an empty collection. The default
// post-signup landing is /u/<username>, an empty profile with the "get
// started" card in the sidebar, which on a phone is below the fold.
export const SIGNUP_HREF = `/signup?next=${encodeURIComponent("/library")}`;

// The only client JS the page needs for measurement. Captures first-touch
// attribution, fires start_view once, and tracks every [data-start-cta]
// click through one delegated listener rather than a client component per
// link, so the rest of /start stays server-rendered.
export function StartTracker() {
  const firedRef = useRef(false);

  useEffect(() => {
    // Only start_view is once-per-mount. The listener must attach on every
    // effect run: under Strict Mode the effect runs, cleans up and runs
    // again with the ref still set, and an early return here left no
    // listener at all.
    if (!firedRef.current) {
      firedRef.current = true;
      const record = captureAttribution();
      trackEvent("start_view", attributionParams(record));
    }

    function onClick(e) {
      const el = e.target instanceof Element ? e.target.closest("[data-start-cta]") : null;
      if (!el) return;
      trackEvent("start_cta_click", {
        cta: el.getAttribute("data-start-cta"),
        location: el.getAttribute("data-start-location") || "",
        ...attributionParams(),
      });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}

// "Start Your Collection — Free" for visitors; a signed-in collector who
// taps the Instagram link gets sent to their library instead of a signup
// form they cannot use.
export function StartPrimaryCta({ location, className }) {
  const { user } = useAuth();
  return (
    <Link
      href={user ? "/library" : SIGNUP_HREF}
      className={className}
      data-start-cta={user ? "go_to_library" : "start_collection"}
      data-start-location={location}
    >
      {user ? "Go to your collection" : "Start Your Collection for Free"}
    </Link>
  );
}
