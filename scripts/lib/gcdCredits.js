const NULL_TEXT = new Set(["", "none", "?", "typeset", "various"]);

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return NULL_TEXT.has(text.toLowerCase()) ? null : text;
}

export function parseCreditNames(text) {
  const seen = new Set();
  const names = [];
  for (const part of String(text ?? "").split(";")) {
    let name = part.trim();
    if (NULL_TEXT.has(name.toLowerCase())) continue;
    name = name.replace(/\s*\[[^\]]*\]\s*$/, "");
    name = name.replace(/(?:\s*\([^)]*\))+\s*$/, "");
    name = name.replace(/\s*\?\s*$/, "").replace(/\s+/g, " ").trim();
    if (NULL_TEXT.has(name.toLowerCase()) || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

// GCD calls most pin-ups "illustration"; "pin-up" is accepted too for old
// or hand-entered records. These are authored content, unlike columns,
// letters pages, ads, title/credits pages, recaps, and other book furniture.
const STORY_TYPES = new Set([
  "comic story", "text story", "photo story", "cartoon", "illustration",
  "pin-up", "biography (nonfictional)",
]);
const ROLE_FIELDS = [
  ["script", "writer"],
  ["pencils", "penciller"],
  ["inks", "inker"],
  ["colors", "colorist"],
  ["letters", "letterer"],
];

export function creditsForIssue(apiIssue) {
  const credits = [];
  const seen = new Set();
  const add = (name, role) => {
    const key = `${name}\0${role}`;
    if (!seen.has(key)) { seen.add(key); credits.push({ name, role }); }
  };
  for (const story of apiIssue?.story_set ?? []) {
    const type = String(story.type ?? "").trim().toLowerCase();
    if (type === "cover") {
      for (const field of ["pencils", "inks"])
        for (const name of parseCreditNames(story[field])) add(name, "cover");
      continue;
    }
    if (!STORY_TYPES.has(type)) continue;
    for (const [field, role] of ROLE_FIELDS)
      for (const name of parseCreditNames(story[field])) add(name, role);
  }
  return credits;
}

export function slugify(name) {
  return String(name ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function storyRows(gcdIssueId, apiIssue) {
  return (apiIssue?.story_set ?? []).map((story, index) => ({
    gcd_issue_id: Number(gcdIssueId),
    sequence_number: Number.isFinite(Number(story.sequence_number)) ? Number(story.sequence_number) : index,
    type: cleanText(story.type), title: cleanText(story.title), feature: cleanText(story.feature),
    script: cleanText(story.script), pencils: cleanText(story.pencils), inks: cleanText(story.inks),
    colors: cleanText(story.colors), letters: cleanText(story.letters), characters: cleanText(story.characters),
    synopsis: cleanText(story.synopsis),
    page_count: cleanText(story.page_count) != null && Number.isFinite(Number(story.page_count)) ? Number(story.page_count) : null,
  }));
}
