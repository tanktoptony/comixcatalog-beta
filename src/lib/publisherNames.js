// Hand-added books carry whatever publisher the member typed: "DC", "Marvel",
// "image", "Boom ", "BOOM! Studios". Search filters then listed "DC" next to
// "DC Comics" as two publishers. Short names map to the spelling the catalog
// (series.resolved_publisher_cached) uses; anything else keeps its own
// spelling with the whitespace tidied.
const ALIASES = new Map([
  ["dc", "DC Comics"],
  ["dc comics", "DC Comics"],
  ["marvel", "Marvel Comics"],
  ["marvel comics", "Marvel Comics"],
  ["image", "Image Comics"],
  ["image comics", "Image Comics"],
  ["boom", "BOOM! Studios"],
  ["boom!", "BOOM! Studios"],
  ["boom studios", "BOOM! Studios"],
  ["boom! studios", "BOOM! Studios"],
  ["idw", "IDW Publishing"],
  ["idw publishing", "IDW Publishing"],
  ["dark horse", "Dark Horse Comics"],
  ["dark horse comics", "Dark Horse Comics"],
  ["oni", "Oni Press"],
  ["oni press", "Oni Press"],
  ["mirage", "Mirage Studios"],
  ["mirage studios", "Mirage Studios"],
]);

export function canonicalPublisher(name) {
  const tidy = String(name ?? "").replace(/\s+/g, " ").trim();
  return ALIASES.get(tidy.toLowerCase()) ?? tidy;
}
