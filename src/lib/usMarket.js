import { US_PUBLISHER_ALLOWLIST } from "./publisher.js";

// Canadian publishers whose catalog is primarily French-language reprints.
// Keep this intentionally small and evidence-based; country alone remains a
// useful signal for the rest of the Canadian collector market.
export const NON_US_MARKET_CANADIAN_PUBLISHERS = [
  "Les Editions Heritage",
  "Les Éditions Héritage",
  "Editions Heritage",
  "Éditions Héritage",
];

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const allowlisted = new Set(US_PUBLISHER_ALLOWLIST.map(normalized));
const excludedCanadian = new Set(NON_US_MARKET_CANADIAN_PUBLISHERS.map(normalized));

export function isUsMarketSeries({ publisherCountry, gcdPublisherName, resolvedPublisher }) {
  if (allowlisted.has(normalized(resolvedPublisher))) return true;
  const country = normalized(publisherCountry);
  if (country === "us") return true;
  if (country !== "ca") return false;
  return !excludedCanadian.has(normalized(gcdPublisherName));
}

export function isSeriesSearchVisible({ usMarket, resolvedPublisher }) {
  return usMarket === true || allowlisted.has(normalized(resolvedPublisher));
}
