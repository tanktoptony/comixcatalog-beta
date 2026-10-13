import test from "node:test";
import assert from "node:assert/strict";
import { isDisposableEmail } from "./disposableEmail.js";

test("blocks exact disposable domains without case sensitivity", () => {
  assert.equal(isDisposableEmail("Collector@Mailinator.com"), true);
});

test("blocks subdomains of disposable domains", () => {
  assert.equal(isDisposableEmail("collector@mx.guerrillamail.com"), true);
});

test("allows normal domains and lookalikes", () => {
  assert.equal(isDisposableEmail("collector@gmail.com"), false);
  assert.equal(isDisposableEmail("collector@mailinator.com.example.org"), false);
});
