import { authedFetch } from "../apiClient.js";

let timer;

export function scheduleBadgeSync(delay = 350) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const response = await authedFetch("/api/badges/sync", { method: "POST" }).catch(() => null);
    if (!response?.ok) return;
    const result = await response.json();
    if (result.new?.length) window.dispatchEvent(new CustomEvent("cc:badges-earned", { detail: result.new }));
  }, delay);
}
