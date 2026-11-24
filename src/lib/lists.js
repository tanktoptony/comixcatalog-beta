export const MAX_LISTS_PER_USER = 100;
export const MAX_ITEMS_PER_LIST = 500;
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 1000;
export const NOTE_MAX = 500;

export function slugify(title) {
  let slug = String(title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) return "list";
  if (slug.length <= 80) return slug;

  slug = slug.slice(0, 80).replace(/-[^-]*$/, "").replace(/-+$/, "");
  return slug || "list";
}

export function uniqueSlug(base, takenSlugs) {
  const taken = new Set(takenSlugs ?? []);
  if (!taken.has(base)) return base;

  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const stem = base.slice(0, 80 - suffix.length).replace(/-+$/, "");
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function validateListInput(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid request body." };
  }

  const value = {};

  if (!partial || Object.hasOwn(body, "title")) {
    if (typeof body.title !== "string") {
      return { error: "Title is required." };
    }

    value.title = body.title.trim();
    if (!value.title) return { error: "Title is required." };
    if (value.title.length > TITLE_MAX) {
      return { error: `Title must be ${TITLE_MAX} characters or fewer.` };
    }
  }

  if (Object.hasOwn(body, "description")) {
    if (body.description != null && typeof body.description !== "string") {
      return { error: "Description must be text." };
    }

    value.description = String(body.description ?? "").trim() || null;
    if (value.description && value.description.length > DESCRIPTION_MAX) {
      return {
        error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
      };
    }
  }

  for (const key of ["is_public", "is_ranked"]) {
    if (Object.hasOwn(body, key)) {
      if (typeof body[key] !== "boolean") {
        return { error: `${key} must be true or false.` };
      }

      value[key] = body[key];
    }
  }

  if (partial && !Object.keys(value).length) {
    return { error: "No list changes supplied." };
  }

  return { value };
}

export function validateNote(note) {
  if (note == null) return { value: null };
  if (typeof note !== "string") return { error: "Note must be text." };

  const value = note.trim() || null;
  if (value && value.length > NOTE_MAX) {
    return { error: `Note must be ${NOTE_MAX} characters or fewer.` };
  }

  return { value };
}

export function reorder(items, issueId, toIndex) {
  const rows = (items ?? []).map((item) => ({ ...item }));
  const from = rows.findIndex(
    (item) => Number(item.base_gcd_issue_id) === Number(issueId)
  );
  if (from < 0) {
    return rows.map((item, position) => ({ ...item, position }));
  }

  const [moved] = rows.splice(from, 1);
  const numericIndex = Number(toIndex);
  const requested = Number.isFinite(numericIndex)
    ? Math.trunc(numericIndex)
    : from;
  const target = Math.max(0, Math.min(rows.length, requested));

  rows.splice(target, 0, moved);
  return rows.map((item, position) => ({ ...item, position }));
}

export function canViewList(list, ownerProfile, viewerId) {
  if (!list || !ownerProfile) return false;
  if (viewerId && String(viewerId) === String(list.user_id)) return true;
  return list.is_public === true && Boolean(ownerProfile.username) && ownerProfile.is_public !== false;
}
