// The mislink check's failure branches, exercised against stub children.
//
// These shipped untested because the only way to reach them was to make the
// real repair script — a four-minute pass over 124k rows — crash on demand.
// So when it did crash, on 2026-09-23, the check reported "could not parse
// repairAllCoverSeriesLinks.js output", which reads like the repair script
// changed its print format rather than died. Wrong file, wrong question.
//
// MISLINK_SCRIPT lets a stub stand in for the child, which makes each branch
// a one-line fixture.
//
// Run: npm run test:health-check

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mislink-stubs-"));
const stub = (name, body) => {
  const file = path.join(dir, `${name}.js`);
  fs.writeFileSync(file, body);
  return file;
};

function runCheck(scriptPath) {
  const res = spawnSync("node", ["scripts/checkCoverIngestHealth.js", "--mode=mislink"], {
    encoding: "utf8",
    env: { ...process.env, MISLINK_SCRIPT: scriptPath },
  });
  return { status: res.status, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

test("a child that dies is reported as a crash, not a parse problem", () => {
  // Mirrors the real 2026-09-23 failure: some output, then gone, nothing on
  // stderr.
  const s = stub(
    "killed",
    'console.log("Loading all covers with a comicvine_volume_id...");\n' +
      'console.log("Covers loaded: 124096");\n' +
      'process.kill(process.pid, "SIGKILL");\n'
  );
  const { status, out } = runCheck(s);
  assert.equal(status, 1);
  assert.match(out, /did not exit cleanly/);
  assert.doesNotMatch(out, /could not parse/);
});

test("a non-zero exit is reported with its code", () => {
  const s = stub("exit3", 'console.log("partial");\nprocess.exit(3);\n');
  const { status, out } = runCheck(s);
  assert.equal(status, 1);
  assert.match(out, /did not exit cleanly/);
  assert.match(out, /exit code 3/);
});

test("a clean exit with no TOTAL line is reported as a format change", () => {
  // The only case the old message was ever right about.
  const s = stub("noline", 'console.log("all done, but in a new format");\n');
  const { status, out } = runCheck(s);
  assert.equal(status, 1);
  assert.match(out, /output format has changed/);
  assert.doesNotMatch(out, /did not exit cleanly/);
});

test("zero volumes needing a relink passes", () => {
  const s = stub("green", 'console.log("TOTAL_RESOLVED_VOLUMES: 0");\n');
  const { status, out } = runCheck(s);
  assert.equal(status, 0);
  assert.match(out, /no new mis-linked volumes/);
});

test("volumes needing a relink fail, and the count is reported", () => {
  const s = stub("dirty", 'console.log("TOTAL_RESOLVED_VOLUMES: 7");\n');
  const { status, out } = runCheck(s);
  assert.equal(status, 1);
  assert.match(out, /7 volume\(s\) have covers mis-tagged/);
});
