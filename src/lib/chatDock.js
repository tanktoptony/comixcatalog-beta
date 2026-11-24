// Open the chat dock (src/components/inbox/ChatDock.js) from anywhere:
// openChatDock() shows the conversation list, openChatDock("name") opens
// that conversation. The header's inbox button uses it.

export const OPEN_CHAT_DOCK_EVENT = "cc:open-chat-dock";

export function openChatDock(username = null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_DOCK_EVENT, { detail: { username } }));
}

// A plain click opens the dock; ctrl/cmd/shift/middle clicks keep the link's
// normal behavior (new tab, new window).
export function isPlainClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
