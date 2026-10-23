export function summarizeThreads(messages = [], viewerId) {
  const threads = new Map();
  const ordered = [...messages].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  for (const message of ordered) {
    const otherId = message.sender_id === viewerId ? message.recipient_id : message.sender_id;
    if (!threads.has(otherId)) threads.set(otherId, { otherId, lastMessage: message, unread: 0 });
    if (message.recipient_id === viewerId && message.read_at == null) threads.get(otherId).unread += 1;
  }
  return [...threads.values()];
}

export function messageDateLabel(iso, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function shouldStartMessageGroup(current, previous) {
  if (!previous || current.sender_id !== previous.sender_id) return true;
  return new Date(current.created_at).toDateString() !== new Date(previous.created_at).toDateString();
}
