import fs from "node:fs";
import path from "node:path";

const requiredStrings = ["id", "slug", "utmCampaign", "descriptionIntro", "pinnedComment"];

export function validateEpisodeConfig(config, source = "episode.json") {
  const errors = [];
  const fail = (field, message) => errors.push(`${source}: ${field} ${message}`);
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${source}: expected a JSON object`);
  }
  for (const field of requiredStrings) if (typeof config[field] !== "string" || !config[field].trim()) fail(field, "must be a non-empty string");
  if (!Number.isInteger(config.number) || config.number < 1) fail("number", "must be a positive integer");
  const expectedId = Number.isInteger(config.number) ? `episode-${String(config.number).padStart(3, "0")}` : null;
  if (expectedId && config.id !== expectedId) fail("id", `must be ${JSON.stringify(expectedId)} for number ${config.number}`);
  if (!Array.isArray(config.titleOptions) || !config.titleOptions.length || config.titleOptions.some((x) => typeof x !== "string" || !x.trim())) fail("titleOptions", "must be a non-empty array of non-empty strings");
  if (!["tony-human", "heygen-scratch"].includes(config.narrator)) fail("narrator", 'must be "tony-human" or "heygen-scratch"');
  validateObjects(config.sections, "sections", ["id"], errors, source);
  for (const [i, section] of (config.sections ?? []).entries()) {
    if (section && section.chapter !== null && (typeof section.chapter !== "string" || !section.chapter.trim())) fail(`sections[${i}].chapter`, "must be a non-empty string or null");
  }
  validateObjects(config.books, "books", ["label", "request", "searchQuery"], errors, source);
  validateObjects(config.shorts, "shorts", ["id", "title", "hook"], errors, source);
  if (!Array.isArray(config.tags) || config.tags.some((x) => typeof x !== "string" || !x.trim())) fail("tags", "must be an array of non-empty strings");
  if (!Array.isArray(config.credits) || config.credits.some((x) => typeof x !== "string" || !x.trim())) fail("credits", "must be an array of non-empty strings");
  const sectionIds = (config.sections ?? []).map((x) => x?.id);
  if (new Set(sectionIds).size !== sectionIds.length) fail("sections", "contains duplicate ids");
  if (errors.length) throw new Error(errors.join("\n"));
  return config;
}

function validateObjects(value, field, stringFields, errors, source) {
  if (!Array.isArray(value) || !value.length) {
    errors.push(`${source}: ${field} must be a non-empty array`);
    return;
  }
  value.forEach((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) errors.push(`${source}: ${field}[${i}] must be an object`);
    else for (const key of stringFields) if (typeof item[key] !== "string" || !item[key].trim()) errors.push(`${source}: ${field}[${i}].${key} must be a non-empty string`);
  });
}

export function loadEpisodeConfig(root, number) {
  const id = `episode-${String(number).padStart(3, "0")}`;
  const file = path.join(root, id, "episode.json");
  if (!fs.existsSync(file)) throw new Error(`Episode config not found: ${file}`);
  let config;
  try { config = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`${file}: invalid JSON (${error.message})`); }
  return { config: validateEpisodeConfig(config, file), file, id };
}
