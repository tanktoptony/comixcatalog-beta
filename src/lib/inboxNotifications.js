export function followerIsNew({ followedAt, followersSeenAt, accountCreatedAt }) {
  const followed = new Date(followedAt).getTime();
  const cutoff = new Date(followersSeenAt || accountCreatedAt).getTime();
  return Number.isFinite(followed) && Number.isFinite(cutoff) && followed > cutoff;
}

export function inboxBadgeTotal({ messages = 0, followers = 0 } = {}) {
  return Math.max(0, Number(messages) || 0) + Math.max(0, Number(followers) || 0);
}

export function inboxAriaLabel({ messages = 0, followers = 0 } = {}) {
  const messageCount = Math.max(0, Number(messages) || 0);
  const followerCount = Math.max(0, Number(followers) || 0);
  if (messageCount === 0 && followerCount === 0) return "Inbox";
  const messageLabel = `${messageCount} unread message${messageCount === 1 ? "" : "s"}`;
  const followerLabel = `${followerCount} new follower${followerCount === 1 ? "" : "s"}`;
  return `Inbox (${messageLabel}, ${followerLabel})`;
}
