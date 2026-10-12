import test from "node:test";
import assert from "node:assert/strict";
import { createScanInput, reviewRowsToAddPayload, runScanQueue, scanInputUsesVision } from "./scanBulk.js";

test("a barcode read never uses the daily vision quota", () => {
  const barcode = createScanInput({ source: "barcode", barcode: "759606083121" });
  const photo = createScanInput({ source: "photo", file: { name: "cover.jpg" } });
  assert.equal(scanInputUsesVision(barcode), false);
  assert.equal(scanInputUsesVision(photo), true);
  assert.equal(barcode.status, "identifying");
  assert.equal(photo.status, "queued");
});

test("bulk queue holds at three requests in flight", async () => {
  let active = 0, peak = 0;
  await runScanQueue([1, 2, 3, 4, 5, 6], async (value) => {
    active += 1; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1; return value;
  });
  assert.equal(peak, 3);
});

test("bulk queue stops starting work at the limit", async () => {
  let left = 2;
  const result = await runScanQueue([1, 2, 3, 4], async (value) => { left -= 1; return value; }, { concurrency: 1, canStart: () => left > 0 });
  assert.deepEqual(result.completed, [1, 2]);
  assert.deepEqual(result.stopped, [3, 4]);
});

test("review rows map details and omit skipped rows", () => {
  const payload = reviewRowsToAddPayload([
    { id: "a", status: "matched", scanId: "scan-a", selected: { gcd_issue_id: 42 }, owned: false, details: { condition: "Fine", purchase_price: "12.50" } },
    { id: "b", status: "matched", scanId: "scan-b", selected: { gcd_issue_id: 43 }, owned: true, ownedChoice: "another", details: { slab_company: "CGC", grade_numeric: "9.8", slab_cert_number: "123", purchase_price: "90" } },
    { id: "c", status: "matched", selected: { gcd_issue_id: 44 }, owned: true, ownedChoice: "skip", details: {} },
  ]);
  assert.equal(payload.length, 2);
  assert.deepEqual(payload[0], { client_id: "a", scan_id: "scan-a", gcd_issue_id: 42, status: "owned", another_copy: false, condition: "Fine", slab_company: null, grade_numeric: null, slab_cert_number: null, purchase_price: 12.5 });
  assert.equal(payload[1].grade_numeric, 9.8);
  assert.equal(payload[1].slab_cert_number, "123");
  assert.equal(payload[1].another_copy, true);
});

test("a row marked skip is never added", () => {
  const payload = reviewRowsToAddPayload([{ id: "skip", status: "matched", selected: { gcd_issue_id: 99 }, owned: true, ownedChoice: "skip" }]);
  assert.deepEqual(payload, []);
});

test("skip only applies to an owned copy, not a replacement match or wantlist", () => {
  const base = { id: "row", status: "matched", selected: { gcd_issue_id: 99 }, ownedChoice: "skip" };
  assert.equal(reviewRowsToAddPayload([{ ...base, owned: false }]).length, 1);
  assert.equal(reviewRowsToAddPayload([{ ...base, owned: true, wantlist: true }]).length, 1);
});
