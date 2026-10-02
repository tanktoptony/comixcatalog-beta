// A book you've listed for sale is still yours until it sells, so it counts
// everywhere a collection counts: totals, value, run completion, story arcs,
// the Story card, exports. Use these instead of `status === "owned"`.
// (Marketplace v1 made "for_sale" its own status in 2026-10; a dozen checks
// still looked for "owned" alone, so listing your whole collection made it
// read as empty.)
export const OWNED_STATUSES = ["owned", "for_sale"];

export function isOwnedStatus(status) {
  return status === "owned" || status === "for_sale";
}
