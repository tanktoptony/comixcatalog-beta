"use client";

import { useState } from "react";

export default function ShareButton({ title }) {
  const [message, setMessage] = useState("");

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setMessage("Link copied");
      window.setTimeout(() => setMessage(""), 2200);
    } catch (error) {
      if (error?.name !== "AbortError") setMessage("Could not copy link");
    }
  }

  return (
    <>
      <button type="button" className="shareable-action" onClick={share}>Share</button>
      {message && <span className="shareable-toast" role="status">{message}</span>}
    </>
  );
}
