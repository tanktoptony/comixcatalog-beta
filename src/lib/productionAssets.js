// Pure helpers for the internal video-production asset retriever
// (/admin/production-assets). No Supabase, no `@/` imports, so this file runs
// under plain `node --test` and in the browser alike.
//
// The resolver itself lives in src/app/api/admin/production-assets/resolve
// and reuses the CSV importer's matching rules (src/lib/csvImport/matchRow.js)
// and the issue page's own cover choice (/api/issues/[id]). Nothing here
// decides which cover a book gets — only how a request line is read and how
// the resulting file is named and checked.

// Normalize a title for comparison: the matchRow reduction, minus a leading
// article. GCD calls the 1963 run "The X-Men" and ComicVine calls the 1991
// one "X-Men"; a person typing either means the same shelf.
export function titleKey(title) {
  return String(title ?? "")
    .trim()
    .replace(/^the\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// One request per line, e.g.
//
//   Uncanny X-Men #1 (1963)
//   X-Men #14 (1991 series)
//   House of M #8
//
// A parenthesized four-digit year anywhere on the line is the year hint.
// It may mean either the year the series started ("1991 series") or the
// year the issue came out; the resolver tries both.
//
// A line with no year inherits the year of the nearest earlier line with the
// same title. That is how people write these lists ("X-Men #14 (1991
// series)" then "X-Men #15"), and without it every follow-on line would be
// ambiguous across dozens of volumes. Inherited years are marked as such so
// the resolver can treat them as a soft hint and the UI can say so.
export function parseRequestLines(text) {
  const out = [];
  const lastYearByTitle = new Map();
  const lines = String(text ?? "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let year = null;
    const yearMatch = line.match(/\(\s*(\d{4})\b[^)]*\)/);
    if (yearMatch) year = Number(yearMatch[1]);
    const withoutParens = line.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

    const m = withoutParens.match(/^(.+?)\s*#\s*([^\s#]+)\s*$/);
    if (!m) {
      out.push({ requested: line, title: null, issue: null, year, yearSource: year ? "explicit" : null, error: "Could not read a title and #issue from this line" });
      continue;
    }
    const title = m[1].trim();
    const issue = m[2].trim();
    const key = titleKey(title);

    let yearSource = null;
    if (year != null) {
      yearSource = "explicit";
      lastYearByTitle.set(key, year);
    } else if (lastYearByTitle.has(key)) {
      year = lastYearByTitle.get(key);
      yearSource = "inherited";
    }
    out.push({ requested: line, title, issue, year, yearSource, error: null });
  }
  return out;
}

// Identify an image from its first bytes. The ZIP must hold real images, and
// a storage object's reported Content-Type is not proof of that (an error
// page or JSON body can arrive with a 200). The extension we write comes from
// these bytes, never from the stored filename.
export function sniffImage(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { mime: "image/gif", ext: "gif" };
  }
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// "1" -> "001", "129" -> "129", "1.5" -> "001-5", "Annual 1" -> "annual-1".
function issueSlug(issueNumber) {
  const raw = String(issueNumber ?? "").trim();
  const m = raw.match(/^(\d+)(.*)$/);
  if (!m) return slugify(raw) || "x";
  const rest = slugify(m[2]);
  return rest ? `${m[1].padStart(3, "0")}-${rest}` : m[1].padStart(3, "0");
}

// uncanny-x-men-141-1981. Named from the catalog's series title (not the
// requested text) so the file says what the book actually is.
export function assetBaseName({ seriesTitle, issueNumber, year }) {
  const series = slugify(String(seriesTitle ?? "").replace(/^the\s+/i, "")) || "comic";
  const parts = [series, issueSlug(issueNumber)];
  if (year != null && Number.isFinite(Number(year))) parts.push(String(year));
  return parts.join("-");
}

// Two requests can legitimately resolve to the same book (a list that names
// #1 twice); never let the second silently overwrite the first in the ZIP.
export function uniqueFilename(base, ext, used) {
  let name = `${base}.${ext}`;
  for (let n = 2; used.has(name); n += 1) name = `${base}-${n}.${ext}`;
  used.add(name);
  return name;
}
