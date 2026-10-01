// In-memory cache for the inbox and message threads, per browser tab, so
// clicking between the inbox and a conversation renders instantly from the
// last copy while a fresh read runs behind it (2026-10-01: each hop used to
// refetch everything and show "Loading…" for a couple of seconds).
// Reset whenever the signed-in user changes, so one account's messages are
// never shown to another.

const store = { userId: null, threads: null, profiles: new Map(), messages: new Map() };

export function inboxCache(userId) {
  if (store.userId !== userId) {
    store.userId = userId;
    store.threads = null;
    store.profiles.clear(); // username -> { id, username, display_name, avatar_url }
    store.messages.clear(); // other user's id -> messages, oldest first
  }
  return store;
}
