import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEpisodeConfig } from "../shared/episodeConfig.js";
import { sectionBoundaries } from "../shared/audioSections.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const number = process.argv[2];
const stage = process.argv[3];
if (!number || !stage) fail("Usage: npm run ep -- <NNN> <init|assets|audio|transcribe|package>");
const { config, id } = loadEpisodeConfig(root, number);
const episodeDir = path.join(root, id);

const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (stage === "init") init();
else if (stage === "assets") await assets();
else if (stage === "audio") audio();
else if (stage === "transcribe") transcribe();
else if (stage === "package") run(process.execPath, [path.join(root, "scripts", "youtube-package.mjs"), String(number)]);
else fail(`Unknown stage ${JSON.stringify(stage)}. Expected init, assets, audio, transcribe, or package.`);

function init() {
  for (const rel of ["audio/approved", "audio/shorts", "transcript", "assets", "output"]) mkdir(path.join(episodeDir, rel));
  const checklist = `# ${id} production checklist

- [ ] Script locked
- [ ] Sections recorded
- [ ] Assets resolved
- [ ] Preview reviewed
- [ ] Package generated
- [ ] Upload unlisted
- [ ] Checks passed
- [ ] Schedule
- [ ] Shorts
`;
  const file = path.join(episodeDir, "CHECKLIST.md");
  if (!fs.existsSync(file)) fs.writeFileSync(file, checklist);
  console.log(`${id}: initialized production folders and validated episode.json`);
}

async function assets() {
  mkdir(path.join(episodeDir, "assets", "covers"));
  let manifest;
  if (process.env.CC_ADMIN_TOKEN) {
    try { manifest = await resolveRemote(); }
    catch (error) { console.warn(`remote resolver unavailable: ${error.message}`); }
  }
  if (!manifest) manifest = fallbackAssets();
  fs.writeFileSync(path.join(episodeDir, "assets", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  run(process.execPath, [path.join(root, "scripts", "sync-assets.mjs"), id, "--from", path.join(episodeDir, "assets")]);
  const counts = { found: 0, missing: 0, ambiguous: 0 };
  manifest.books.forEach((b) => counts[b.status]++);
  console.log(`${id} assets: ${counts.found} found, ${counts.missing} missing, ${counts.ambiguous} ambiguous`);
}

async function resolveRemote() {
  const base = (process.env.CC_BASE_URL || "https://www.comixcatalog.com").replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${process.env.CC_ADMIN_TOKEN}` };
  const response = await fetch(`${base}/api/admin/production-assets/resolve`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ text: config.books.map((b) => b.request).join("\n") }) });
  if (!response.ok) throw new Error(`resolve endpoint returned ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const books = [];
  for (let i = 0; i < config.books.length; i++) {
    const request = config.books[i].request;
    const result = payload.results?.[i];
    if (result?.status === "ambiguous") { books.push({ request, status: "ambiguous", file: null, source: "admin-resolver", notes: result.notes }); continue; }
    if (result?.status !== "matched" || !result.match?.cover) { books.push({ request, status: "missing", file: null, source: "admin-resolver", notes: result?.notes ?? ["No match returned"] }); continue; }
    const asset = await fetch(`${base}/api/admin/production-assets/asset?issueId=${encodeURIComponent(result.match.issueId)}`, { headers });
    if (!asset.ok) { books.push({ request, status: "missing", file: null, source: "admin-resolver", notes: [`asset endpoint returned ${asset.status}`] }); continue; }
    const meta = JSON.parse(decodeURIComponent(asset.headers.get("x-asset-meta") || "%7B%7D"));
    const file = `${meta.filenameBase || result.match.issueId}.${meta.ext || "jpg"}`;
    fs.writeFileSync(path.join(episodeDir, "assets", "covers", file), Buffer.from(await asset.arrayBuffer()));
    books.push({ request, status: "found", file: `covers/${file}`, source: meta });
  }
  return { episode: id, generatedAt: new Date().toISOString(), books };
}

function fallbackAssets() {
  const source = path.join(os.homedir(), "Desktop", `${id}-assets`);
  const covers = path.join(source, "covers");
  if (fs.existsSync(covers)) fs.cpSync(covers, path.join(episodeDir, "assets", "covers"), { recursive: true });
  let old = null;
  if (fs.existsSync(path.join(source, "manifest.json"))) try { old = JSON.parse(fs.readFileSync(path.join(source, "manifest.json"), "utf8")); } catch {}
  const entries = old?.books ?? old?.results ?? [];
  const files = fs.existsSync(covers) ? fs.readdirSync(covers).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f)) : [];
  const books = config.books.map((book, i) => {
    const known = entries.find((x) => (x.request ?? x.requested) === book.request) ?? entries[i];
    const file = known?.file ?? (files.length === config.books.length ? `covers/${files[i]}` : null);
    return { request: book.request, status: file ? "found" : known?.status === "ambiguous" ? "ambiguous" : "missing", file, source: file ? `desktop:${source}` : "desktop-fallback" };
  });
  return { episode: id, generatedAt: new Date().toISOString(), books };
}

function audio() {
  const approved = path.join(episodeDir, "audio", "approved");
  if (!fs.existsSync(approved)) fail(`Missing ${approved}; run the init stage and add recordings first.`);
  const files = fs.readdirSync(approved).filter((f) => /\.(wav|m4a|mp3)$/i.test(f)).sort((a, b) => a.localeCompare(b));
  if (!files.length) fail(`No wav, m4a, or mp3 recordings found in ${approved}`);
  const ffmpeg = remotionBinary("ffmpeg");
  const ffprobe = remotionBinary("ffprobe");
  const durations = files.map((file) => probeDuration(ffprobe, path.join(approved, file)));
  const boundaries = sectionBoundaries(files, durations);
  if (files.length === 1 && boundaries[0].id !== config.sections[0]?.id) boundaries[0].id = config.sections[0]?.id ?? boundaries[0].id;
  if (files.length > 1) {
    const expected = new Set(config.sections.map((s) => s.id));
    for (const section of boundaries) if (!expected.has(section.id)) console.warn(`recording ${section.file} does not match a configured section id`);
  }
  const publicAudio = path.join(root, "public", id, "audio");
  mkdir(publicAudio);
  const output = path.join(publicAudio, "narration-master.wav");
  if (files.length === 1 && path.extname(files[0]).toLowerCase() === ".wav") fs.copyFileSync(path.join(approved, files[0]), output);
  else {
    const args = ["-y"];
    files.forEach((file) => args.push("-i", path.join(approved, file)));
    if (files.length > 1) args.push("-filter_complex", `${files.map((_, i) => `[${i}:a]`).join("")}concat=n=${files.length}:v=0:a=1[out]`, "-map", "[out]");
    args.push("-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", output);
    run(ffmpeg, args);
  }
  mkdir(path.join(episodeDir, "transcript"));
  fs.writeFileSync(path.join(episodeDir, "transcript", "sections.json"), JSON.stringify({ source: files, duration: boundaries.at(-1).end, sections: boundaries }, null, 2) + "\n");
  console.log(`${id}: ${files.length} recording(s), ${boundaries.at(-1).end.toFixed(3)}s -> ${output}`);
}

function probeDuration(ffprobe, file) {
  const result = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not read duration of ${file}: ${result.stderr}`);
  return Number(result.stdout.trim());
}

function remotionBinary(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const direct = path.join(root, "node_modules", "@remotion", "compositor-win32-x64-msvc", exe);
  if (fs.existsSync(direct)) return direct;
  const scope = path.join(root, "node_modules", "@remotion");
  const hit = fs.readdirSync(scope).map((d) => path.join(scope, d, exe)).find(fs.existsSync);
  if (!hit) throw new Error(`Could not find Remotion's bundled ${exe}; run npm install first.`);
  return hit;
}

function transcribe() {
  const audioFile = path.join(root, "public", id, "audio", "narration-master.wav");
  if (!fs.existsSync(audioFile)) fail(`Missing ${audioFile}; run the audio stage first.`);
  const python = process.platform === "win32" ? path.join(root, ".venv", "Scripts", "python.exe") : path.join(root, ".venv", "bin", "python");
  const command = fs.existsSync(python) ? python : (process.platform === "win32" ? "python" : "python3");
  if (!fs.existsSync(python)) console.warn(".venv not found; using system Python. Run npm run setup:whisper for the persistent environment.");
  run(command, [path.join(root, "scripts", "transcribe.py"), audioFile, path.join(episodeDir, "narration.words.js")]);
}

function fail(message) { console.error(message); process.exit(1); }
