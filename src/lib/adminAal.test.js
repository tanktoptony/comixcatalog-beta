import { test } from "node:test";
import assert from "node:assert/strict";
import { aalFromToken, bearerToken } from "./adminAal.js";

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

test("reads aal2 and aal1 from the token", () => {
  assert.equal(aalFromToken(jwt({ sub: "x", aal: "aal2" })), "aal2");
  assert.equal(aalFromToken(jwt({ sub: "x", aal: "aal1" })), "aal1");
});

test("missing or garbage tokens are never aal2", () => {
  assert.equal(aalFromToken(""), null);
  assert.equal(aalFromToken(null), null);
  assert.equal(aalFromToken("not-a-jwt"), null);
  assert.equal(aalFromToken("a.%%%.c"), null);
  assert.equal(aalFromToken(jwt({ sub: "x" })), null);
});

test("bearer token is read from the Authorization header", () => {
  const req = { headers: new Map([["authorization", "Bearer abc.def.ghi"]]) };
  assert.equal(bearerToken(req), "abc.def.ghi");
  assert.equal(bearerToken({ headers: new Map() }), "");
});
