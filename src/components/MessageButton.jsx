"use client";

// Messaging v1 is wallpapered off while we focus on data ingestion. The
// inbox routes still exist behind /inbox/* for testing, but the entry
// points (profile button + header icon) are hidden so users don't trip
// over the hanging-load issue. Re-enable by restoring the original render.
export default function MessageButton() {
  return null;
}
