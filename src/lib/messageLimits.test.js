import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLimits, MESSAGE_LIMITS } from "./messageLimits.js";

const base = {
  isNewAccount: true,
  sentLastHour: 0,
  newConversationsToday: 0,
  isNewConversation: false,
};

test("the 10th hourly message is allowed and the 11th is refused for a new account", () => {
  assert.equal(checkLimits({ ...base, sentLastHour: 9 }), null);
  assert.deepEqual(checkLimits({ ...base, sentLastHour: 10 }), {
    status: 429,
    error: "You've sent a lot of messages in the last hour. Try again later.",
  });
});

test("established accounts use the larger hourly limit", () => {
  assert.equal(checkLimits({ ...base, isNewAccount: false, sentLastHour: 59 }), null);
  assert.equal(checkLimits({ ...base, isNewAccount: false, sentLastHour: 60 })?.status, 429);
});

test("a reply does not count when the new-conversation limit is used up", () => {
  assert.equal(
    checkLimits({
      ...base,
      newConversationsToday: MESSAGE_LIMITS.newConversationsPerDay.newAccount,
      isNewConversation: false,
    }),
    null
  );
  assert.equal(
    checkLimits({
      ...base,
      newConversationsToday: MESSAGE_LIMITS.newConversationsPerDay.newAccount,
      isNewConversation: true,
    })?.status,
    429
  );
});
