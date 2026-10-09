export const MESSAGE_LIMITS = Object.freeze({
  newAccountDays: 7,
  messagesPerHour: Object.freeze({ newAccount: 10, established: 60 }),
  newConversationsPerDay: Object.freeze({ newAccount: 3, established: 20 }),
});

export function checkLimits({
  isNewAccount,
  sentLastHour,
  newConversationsToday,
  isNewConversation,
}) {
  const hourlyLimit = isNewAccount
    ? MESSAGE_LIMITS.messagesPerHour.newAccount
    : MESSAGE_LIMITS.messagesPerHour.established;
  if (sentLastHour >= hourlyLimit) {
    return {
      status: 429,
      error: "You've sent a lot of messages in the last hour. Try again later.",
    };
  }

  const conversationLimit = isNewAccount
    ? MESSAGE_LIMITS.newConversationsPerDay.newAccount
    : MESSAGE_LIMITS.newConversationsPerDay.established;
  if (isNewConversation && newConversationsToday >= conversationLimit) {
    return {
      status: 429,
      error: "You've started a lot of new conversations today. Try again tomorrow.",
    };
  }

  return null;
}
