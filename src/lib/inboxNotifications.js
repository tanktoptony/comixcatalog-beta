export function followerIsNew({ followedAt, followersSeenAt, accountCreatedAt }) {
  const followed = new Date(followedAt).getTime();
  const cutoff = new Date(followersSeenAt || accountCreatedAt).getTime();
  return Number.isFinite(followed) && Number.isFinite(cutoff) && followed > cutoff;
}

export function inboxBadgeTotal({ messages = 0, followers = 0, purchases = 0, notifications = 0 } = {}) {
  return [messages, followers, purchases, notifications].reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

export function inboxAriaLabel({ messages = 0, followers = 0, purchases = 0, notifications = 0 } = {}) {
  const messageCount = Math.max(0, Number(messages) || 0);
  const followerCount = Math.max(0, Number(followers) || 0);
  const purchaseCount = Math.max(0, Number(purchases) || 0);
  const activityCount = Math.max(0, Number(notifications) || 0);
  if (messageCount === 0 && followerCount === 0 && purchaseCount === 0 && activityCount === 0) return "Inbox";
  if (activityCount > 0) {
    const parts = [
      `${messageCount} unread message${messageCount === 1 ? "" : "s"}`,
      `${followerCount} new follower${followerCount === 1 ? "" : "s"}`,
      `${purchaseCount} pending purchase${purchaseCount === 1 ? "" : "s"}`,
      `${activityCount} new repl${activityCount === 1 ? "y or mention" : "ies or mentions"}`,
    ];
    return `Inbox (${parts.join(", ")})`;
  }
  const messageLabel = `${messageCount} unread message${messageCount === 1 ? "" : "s"}`;
  const followerLabel = `${followerCount} new follower${followerCount === 1 ? "" : "s"}`;
  const purchaseLabel = `${purchaseCount} pending purchase${purchaseCount === 1 ? "" : "s"}`;
  return `Inbox (${messageLabel}, ${followerLabel}, ${purchaseLabel})`;
}
