export const SEARCH_UNAVAILABLE_MESSAGE = "Search is temporarily unavailable. Please try again.";

export function searchRoutePolicy({ failed = false, degraded = false } = {}) {
  if (failed) {
    return { status: 503, cacheControl: "no-store" };
  }
  if (degraded) {
    return { status: 200, cacheControl: "private, no-store" };
  }
  return { status: 200, cacheControl: null };
}

export function searchClientState(routes = []) {
  const states = routes.map((route) => route?.state);
  const hasResults = routes.some((route) => Number(route?.resultCount) > 0);
  if (states.includes("failed")) {
    if (hasResults) return "degraded";
    if (states.includes("pending")) return "pending";
    return "failed";
  }
  if (states.includes("degraded")) return "degraded";
  if (states.includes("pending")) return "pending";
  return "ready";
}
