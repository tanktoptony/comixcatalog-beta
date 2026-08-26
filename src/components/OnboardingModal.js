"use client";

// First-visit onboarding modal. Mounted once in the root layout (not a
// single page) so it can actually fire wherever a signed-in user's first
// page load happens to land — which, after signup, is /u/[username], not
// the homepage. Mounting it homepage-only meant it essentially never fired,
// since a signed-in user has little reason to revisit "/". Dismissable;
// the "Skip for now" path still flags the modal as seen so it never
// re-fires automatically. We deliberately don't tie this to "empty
// collection" — even users with items benefit from learning grading,
// sharing, and Pro perks exist.
//
// Repeat-visit access: dispatch a `window` "cc:open-onboarding" event (see
// the header's "How this works" button) to force it open regardless of the
// seen-flag — the one persistent, always-available way back into this
// guidance for anyone who dismissed it once and later got lost.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const STORAGE_KEY = "cc:onboarding-seen";

const STEPS = [
  {
    icon: "🔍",
    title: "Search the database",
    body:
      "Every series, every issue, every variant. 217k+ series indexed. Search by title, character, publisher, or year — then add what you own.",
    cta: { href: "/search", label: "Open search" },
  },
  {
    icon: "📚",
    title: "Build your library",
    body:
      "Track condition, slab grade, cert numbers, what you paid, current value, and notes. Filter by publisher, era, or slab status. Generate insurance-ready PDFs.",
    cta: { href: "/library", label: "Open your library" },
  },
  {
    icon: "🤝",
    title: "Share your collection",
    body:
      "Your public profile at comixcatalog.com/u/<username> works like Discogs for comics. Show off your shelves, message other collectors, get verified.",
    cta: { href: "/account", label: "Set your username" },
  },
];

export default function OnboardingModal() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (loading || !user) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      return;
    }
    // Small delay so the modal doesn't slam in during the first paint.
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [user, loading]);

  // Manual re-open, regardless of the seen-flag — the header's "How this
  // works" button dispatches this. Always starts back at step 0.
  useEffect(() => {
    function handleForceOpen() {
      setStep(0);
      setOpen(true);
    }
    window.addEventListener("cc:open-onboarding", handleForceOpen);
    return () => window.removeEventListener("cc:open-onboarding", handleForceOpen);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  };

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <button
          type="button"
          className="onboarding-close"
          onClick={dismiss}
          aria-label="Close"
        >
          ×
        </button>

        <div className="onboarding-dots">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot ${i === step ? "is-active" : ""} ${i < step ? "is-done" : ""}`}
            />
          ))}
        </div>

        <div className="onboarding-icon" aria-hidden="true">{current.icon}</div>
        <h2 id="onboarding-title" className="onboarding-title">{current.title}</h2>
        <p className="onboarding-body">{current.body}</p>

        <div className="onboarding-actions">
          <Link href={current.cta.href} className="onboarding-cta" onClick={dismiss}>
            {current.cta.label} →
          </Link>
          {!isLast ? (
            <button type="button" className="onboarding-secondary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <Link href="/about" className="onboarding-secondary" onClick={dismiss}>
              Learn more
            </Link>
          )}
        </div>

        <button type="button" className="onboarding-skip" onClick={dismiss}>
          {isLast ? "Got it" : "Skip for now"}
        </button>
      </div>
    </div>
  );
}
