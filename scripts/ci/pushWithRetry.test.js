import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const helper = resolve("scripts/ci/push-with-retry.sh");

// A git hook (pre-push runs this suite) exports GIT_DIR, GIT_INDEX_FILE and
// friends. Left in place they point every git call below at the real repo
// instead of the scratch clones.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));

function command(bin, args, cwd) {
  const result = spawnSync(bin, args, { cwd, encoding: "utf8", env });
  if (result.status !== 0) {
    throw new Error(`${bin} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout.trim();
}

function git(cwd, ...args) {
  return command("git", args, cwd);
}

function configureClone(path) {
  git(path, "config", "user.name", "CI Test");
  git(path, "config", "user.email", "ci-test@example.com");
}

function shellPath(path) {
  const normalized = path.replaceAll("\\", "/");
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return drive ? `/${drive[1].toLowerCase()}/${drive[2]}` : normalized;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function setupRepository(t) {
  const root = mkdtempSync(join(tmpdir(), "push-with-retry-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  git(root, "init", "--bare", remote);
  git(root, "init", seed);
  configureClone(seed);
  writeFileSync(join(seed, "shared.txt"), "base\n");
  git(seed, "add", "shared.txt");
  git(seed, "commit", "-m", "initial");
  git(seed, "branch", "-M", "main");
  git(seed, "remote", "add", "origin", remote);
  git(seed, "push", "-u", "origin", "main");
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
  return { root, remote };
}

function clone(remote, path) {
  git(join(path, ".."), "clone", remote, path);
  configureClone(path);
}

function runHelper(cwd) {
  return spawnSync("bash", [shellPath(helper), "origin", "main"], {
    cwd,
    env,
    encoding: "utf8",
  });
}

test("push retry rebases and succeeds after another clone wins the push race", (t) => {
  const { root, remote } = setupRepository(t);
  const first = join(root, "first");
  const second = join(root, "second");
  clone(remote, first);
  clone(remote, second);

  writeFileSync(join(first, "first.txt"), "first\n");
  git(first, "add", "first.txt");
  git(first, "commit", "-m", "first change");
  writeFileSync(join(second, "second.txt"), "second\n");
  git(second, "add", "second.txt");
  git(second, "commit", "-m", "second change");

  const hooks = join(root, "hooks");
  const marker = join(root, "race-fired");
  git(first, "config", "core.hooksPath", hooks);
  mkdirSync(hooks);
  const hook = join(hooks, "pre-push");
  writeFileSync(hook, `#!/usr/bin/env bash\nif [ ! -f ${shellQuote(shellPath(marker))} ]; then\n  touch ${shellQuote(shellPath(marker))}\n  git -C ${shellQuote(shellPath(second))} push origin main\nfi\n`);
  chmodSync(hook, 0o755);

  const result = runHelper(first);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const subjects = git(remote, "log", "--format=%s", "main").split("\n");
  assert.ok(subjects.includes("first change"));
  assert.ok(subjects.includes("second change"));
});

test("push retry stops immediately when pull rebase has a conflict", (t) => {
  const { root, remote } = setupRepository(t);
  const first = join(root, "first");
  const second = join(root, "second");
  clone(remote, first);
  clone(remote, second);

  writeFileSync(join(first, "shared.txt"), "first version\n");
  git(first, "add", "shared.txt");
  git(first, "commit", "-m", "first conflict");
  writeFileSync(join(second, "shared.txt"), "second version\n");
  git(second, "add", "shared.txt");
  git(second, "commit", "-m", "second conflict");
  git(second, "push", "origin", "main");

  const result = runHelper(first);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /::error::Rebase conflict detected/);
  assert.equal(git(first, "status", "--porcelain"), "");
  assert.equal(readFileSync(join(first, "shared.txt"), "utf8").replaceAll("\r\n", "\n"), "first version\n");
});
