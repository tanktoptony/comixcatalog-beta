// The open-redirect guard on the post-login destination. The only input that
// is not ours is `?next=`, and it lands here after the login page reads it.
//
// Run: npm run test:post-auth-redirect

import test from "node:test";
import assert from "node:assert/strict";

import { redirectAfterAuth } from "./postAuthRedirect.js";

// Stand in for window.location.assign and record where we were sent.
function withFakeWindow(run) {
  const prior = globalThis.window;
  const calls = [];
  globalThis.window = { location: { assign: (p) => calls.push(p) } };
  try {
    run();
  } finally {
    if (prior === undefined) delete globalThis.window;
    else globalThis.window = prior;
  }
  return calls;
}

test("sends the user to a same-origin path", () => {
  assert.deepEqual(withFakeWindow(() => redirectAfterAuth("/u/thrice347")), ["/u/thrice347"]);
});

test("a protocol-relative path cannot smuggle in another origin", () => {
  // "//evil.example" is a valid URL to a DIFFERENT host. The login page
  // already rejects it when reading ?next=, and this is the second line of
  // defence for every other caller.
  assert.deepEqual(withFakeWindow(() => redirectAfterAuth("//evil.example/steal")), ["/"]);
});

test("an absolute URL to another site falls back to home", () => {
  assert.deepEqual(withFakeWindow(() => redirectAfterAuth("https://evil.example")), ["/"]);
  assert.deepEqual(withFakeWindow(() => redirectAfterAuth("javascript:alert(1)")), ["/"]);
});

test("missing or non-string destinations fall back to home", () => {
  assert.deepEqual(withFakeWindow(() => redirectAfterAuth(null)), ["/"]);
  assert.deepEqual(withFakeWindow(() => redirectAfterAuth(undefined)), ["/"]);
  assert.deepEqual(withFakeWindow(() => redirectAfterAuth(42)), ["/"]);
  assert.deepEqual(withFakeWindow(() => redirectAfterAuth("")), ["/"]);
});

test("query strings and fragments on a same-origin path survive", () => {
  assert.deepEqual(withFakeWindow(() => redirectAfterAuth("/issue/42?added=1#top")), ["/issue/42?added=1#top"]);
});

test("does nothing at all on the server rather than throwing", () => {
  // It is a client helper, but a stray import from a server component must
  // not take the render down.
  const prior = globalThis.window;
  delete globalThis.window;
  try {
    assert.doesNotThrow(() => redirectAfterAuth("/u/someone"));
  } finally {
    if (prior !== undefined) globalThis.window = prior;
  }
});
