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

// GCD publisher countries whose series can be US market. Anything else is a
// local edition even when its resolved publisher is a US brand: Panini
// Deutschland's Batman resolves to "DC Comics" (9,632 such rows found
// 2026-10-18). Canada and the UK keep their existing rules on purpose.
const MARKET_COUNTRIES = new Set(["us", "ca", "gb"]);

export function isUsMarketSeries({ publisherCountry, gcdPublisherName, resolvedPublisher }) {
  const country = normalized(publisherCountry);
  if (country && !MARKET_COUNTRIES.has(country)) return false;
  if (allowlisted.has(normalized(resolvedPublisher))) return true;
  if (country === "us") return true;
  if (country !== "ca") return false;
  return !excludedCanadian.has(normalized(gcdPublisherName));
}

export function isSeriesSearchVisible({ usMarket, resolvedPublisher }) {
  return usMarket === true || allowlisted.has(normalized(resolvedPublisher));
}
