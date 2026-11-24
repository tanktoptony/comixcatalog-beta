"use client";

// Reopens the first-visit guide (OnboardingModal, mounted in the root layout)
// for anyone who skipped it. This used to be "How this works" in the avatar
// menu; the Help Center is its home since the menu was trimmed (Nov 2026).
export default function TourButton() {
  return (
    <button
      type="button"
      className="help-tour-btn"
      onClick={() => window.dispatchEvent(new Event("cc:open-onboarding"))}
    >
      How ComixCatalog works
    </button>
  );
}
