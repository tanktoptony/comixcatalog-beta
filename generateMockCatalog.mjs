// generateMockCatalog.mjs
import fs from "fs";
import path from "path";

const coversDir = path.join(process.cwd(), "public", "covers");

const files = fs
  .readdirSync(coversDir)
  .filter(
    (f) =>
      f.toLowerCase().endsWith(".jpg") ||
      f.toLowerCase().endsWith(".jpeg") ||
      f.toLowerCase().endsWith(".png")
  );

function toTitle(str) {
  return str
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const items = files.map((file, index) => {
  const base = file.replace(/\.[^.]+$/, ""); // remove extension, e.g. "avengers-83"
  const parts = base.split("-");
  let seriesToken = parts[0];
  let issueNumber = parts[1] || "1";

  const id = index + 1;
  const series = toTitle(seriesToken);

  return {
    id,
    series,
    issueNumber: Number(issueNumber) || 1,
    title: `${series} #${issueNumber}`,
    year: 2000, // TODO: update later with real data
    creator: "TBD",
    publisher: "TBD",
    cover: file,
  };
});

const output = `// AUTO-GENERATED FROM public/covers/*.jpg
export const MOCK_ITEMS = ${JSON.stringify(items, null, 2)};
`;

const outPath = path.join(process.cwd(), "src", "data", "mockCatalog.js");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, output, "utf8");

console.log(`Wrote ${items.length} items to src/data/mockCatalog.js`);
