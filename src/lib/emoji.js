// Emoji for messages: the picker's set, Slack-style :shortcodes:, and the
// reactions on a message. The same list is the server's allowlist for
// reactions (POST /api/messages/reactions), so a reaction is always one of
// these and never arbitrary text.
//
// Each entry: [emoji, category, ...shortcodes]. The first shortcode is the
// canonical name (shown in the picker), the rest are aliases people type.

export const EMOJI_CATEGORIES = [
  { id: "faces", label: "Smileys" },
  { id: "hands", label: "Hands" },
  { id: "hearts", label: "Hearts" },
  { id: "comics", label: "Comics" },
  { id: "deals", label: "Deals" },
  { id: "things", label: "Things" },
];

const LIST = [
  ["😀", "faces", "grinning", "smile_big"],
  ["😃", "faces", "smiley"],
  ["😄", "faces", "smile"],
  ["😁", "faces", "grin"],
  ["😆", "faces", "laughing", "satisfied"],
  ["😅", "faces", "sweat_smile"],
  ["🤣", "faces", "rofl"],
  ["😂", "faces", "joy", "lol"],
  ["🙂", "faces", "slightly_smiling_face"],
  ["🙃", "faces", "upside_down_face"],
  ["😉", "faces", "wink"],
  ["😊", "faces", "blush"],
  ["😇", "faces", "innocent"],
  ["🥰", "faces", "smiling_face_with_3_hearts"],
  ["😍", "faces", "heart_eyes"],
  ["🤩", "faces", "star_struck"],
  ["😘", "faces", "kissing_heart"],
  ["😋", "faces", "yum"],
  ["😜", "faces", "stuck_out_tongue_winking_eye"],
  ["🤪", "faces", "zany_face"],
  ["🤑", "faces", "money_mouth_face"],
  ["🤗", "faces", "hugging_face", "hug"],
  ["🤭", "faces", "hand_over_mouth"],
  ["🤫", "faces", "shushing_face"],
  ["🤔", "faces", "thinking_face", "thinking", "hmm"],
  ["🤐", "faces", "zipper_mouth_face"],
  ["🤨", "faces", "raised_eyebrow"],
  ["😐", "faces", "neutral_face"],
  ["😑", "faces", "expressionless"],
  ["😶", "faces", "no_mouth"],
  ["😏", "faces", "smirk"],
  ["😒", "faces", "unamused"],
  ["🙄", "faces", "roll_eyes", "eyeroll"],
  ["😬", "faces", "grimacing"],
  ["😌", "faces", "relieved"],
  ["😔", "faces", "pensive"],
  ["😴", "faces", "sleeping"],
  ["🤤", "faces", "drooling_face", "drool"],
  ["😷", "faces", "mask"],
  ["🤯", "faces", "exploding_head", "mind_blown"],
  ["🥳", "faces", "partying_face", "party_face"],
  ["😎", "faces", "sunglasses", "cool"],
  ["🤓", "faces", "nerd_face", "nerd"],
  ["🧐", "faces", "monocle_face"],
  ["😕", "faces", "confused"],
  ["😟", "faces", "worried"],
  ["😮", "faces", "open_mouth", "wow"],
  ["😲", "faces", "astonished"],
  ["😳", "faces", "flushed"],
  ["🥺", "faces", "pleading_face", "pleading"],
  ["😢", "faces", "cry"],
  ["😭", "faces", "sob"],
  ["😱", "faces", "scream"],
  ["😤", "faces", "triumph"],
  ["😡", "faces", "rage", "angry"],
  ["🤬", "faces", "cursing_face"],
  ["😈", "faces", "smiling_imp"],
  ["💀", "faces", "skull", "dead"],
  ["🤡", "faces", "clown_face", "clown"],
  ["👻", "faces", "ghost"],
  ["👽", "faces", "alien"],
  ["🤖", "faces", "robot_face", "robot"],

  ["👍", "hands", "+1", "thumbsup", "thumbs_up"],
  ["👎", "hands", "-1", "thumbsdown", "thumbs_down"],
  ["👌", "hands", "ok_hand", "ok"],
  ["🤌", "hands", "pinched_fingers", "chefs_kiss"],
  ["✌️", "hands", "v", "peace"],
  ["🤞", "hands", "crossed_fingers", "fingers_crossed"],
  ["🤟", "hands", "love_you_gesture"],
  ["🤘", "hands", "metal", "rock_on"],
  ["🤙", "hands", "call_me_hand", "shaka"],
  ["👈", "hands", "point_left"],
  ["👉", "hands", "point_right"],
  ["👆", "hands", "point_up_2"],
  ["👇", "hands", "point_down"],
  ["👋", "hands", "wave", "hi"],
  ["🖐️", "hands", "raised_hand_with_fingers_splayed"],
  ["✋", "hands", "raised_hand", "hand"],
  ["👏", "hands", "clap"],
  ["🙌", "hands", "raised_hands", "hooray"],
  ["🫶", "hands", "heart_hands"],
  ["🤝", "hands", "handshake", "deal"],
  ["🙏", "hands", "pray", "thanks", "please"],
  ["💪", "hands", "muscle", "flex", "strong"],
  ["👀", "hands", "eyes", "looking"],
  ["🫡", "hands", "saluting_face", "salute"],

  ["❤️", "hearts", "heart", "red_heart"],
  ["🧡", "hearts", "orange_heart"],
  ["💛", "hearts", "yellow_heart", "gold_heart"],
  ["💚", "hearts", "green_heart"],
  ["💙", "hearts", "blue_heart"],
  ["💜", "hearts", "purple_heart"],
  ["🖤", "hearts", "black_heart"],
  ["🤍", "hearts", "white_heart"],
  ["💔", "hearts", "broken_heart"],
  ["💕", "hearts", "two_hearts"],
  ["💖", "hearts", "sparkling_heart"],
  ["💯", "hearts", "100", "hundred"],
  ["💥", "hearts", "boom", "collision", "pow"],
  ["💫", "hearts", "dizzy"],
  ["✨", "hearts", "sparkles"],
  ["🔥", "hearts", "fire", "lit", "hot"],
  ["⚡", "hearts", "zap", "lightning"],
  ["⭐", "hearts", "star"],
  ["🌟", "hearts", "star2", "glowing_star"],

  ["📚", "comics", "books", "comics", "longbox"],
  ["📖", "comics", "book", "open_book", "reading"],
  ["🦸", "comics", "superhero", "hero"],
  ["🦹", "comics", "supervillain", "villain"],
  ["🦇", "comics", "bat", "batman"],
  ["🕷️", "comics", "spider", "spidey"],
  ["🕸️", "comics", "spider_web", "web"],
  ["🛡️", "comics", "shield", "cap"],
  ["🔨", "comics", "hammer", "thor"],
  ["🐢", "comics", "turtle", "tmnt"],
  ["🧛", "comics", "vampire"],
  ["🧟", "comics", "zombie"],
  ["🐉", "comics", "dragon"],
  ["🚀", "comics", "rocket", "to_the_moon"],
  ["🪐", "comics", "ringed_planet", "cosmic"],
  ["🗯️", "comics", "right_anger_bubble", "speech_bubble_angry"],
  ["💬", "comics", "speech_balloon", "speech"],
  ["💭", "comics", "thought_balloon", "thought"],
  ["🎨", "comics", "art", "artist"],
  ["✏️", "comics", "pencil2", "pencils"],
  ["🖊️", "comics", "pen", "inks", "signed"],
  ["🔍", "comics", "mag", "search", "grading"],
  ["🏆", "comics", "trophy", "grail"],
  ["🥇", "comics", "first_place_medal", "first"],
  ["🔑", "comics", "key", "key_issue"],

  ["💰", "deals", "moneybag", "money_bag"],
  ["💵", "deals", "dollar", "cash"],
  ["🤑", "deals", "money_mouth", "rich"],
  ["💸", "deals", "money_with_wings", "spent"],
  ["💎", "deals", "gem", "diamond"],
  ["🏷️", "deals", "label", "price_tag", "tag"],
  ["🛒", "deals", "shopping_trolley", "cart"],
  ["📦", "deals", "package", "box", "shipped"],
  ["📬", "deals", "mailbox_with_mail", "mail"],
  ["🚚", "deals", "truck", "shipping"],
  ["📈", "deals", "chart_with_upwards_trend", "stonks", "up"],
  ["📉", "deals", "chart_with_downwards_trend", "down"],
  ["✅", "deals", "white_check_mark", "check", "done"],
  ["❌", "deals", "x", "no"],
  ["⚠️", "deals", "warning"],
  ["⏳", "deals", "hourglass_flowing_sand", "waiting"],
  ["🔄", "deals", "arrows_counterclockwise", "trade", "swap"],
  ["🎉", "deals", "tada", "party", "congrats"],
  ["🎁", "deals", "gift", "present"],

  ["📸", "things", "camera_with_flash", "photo", "pics"],
  ["📱", "things", "iphone", "phone"],
  ["💻", "things", "computer", "laptop"],
  ["🍕", "things", "pizza"],
  ["🍿", "things", "popcorn"],
  ["☕", "things", "coffee"],
  ["🍺", "things", "beer"],
  ["🎮", "things", "video_game", "gaming"],
  ["🎬", "things", "clapper", "movie"],
  ["📺", "things", "tv"],
  ["🎧", "things", "headphones"],
  ["🧠", "things", "brain"],
  ["⏰", "things", "alarm_clock", "alarm"],
  ["📅", "things", "date", "calendar"],
  ["📌", "things", "pushpin", "pin"],
  ["🗑️", "things", "wastebasket", "trash"],
];

// Duplicate glyphs across categories (🤑) keep their first entry.
export const EMOJI = [];
const byGlyph = new Map();
const byName = new Map();
for (const [glyph, category, ...names] of LIST) {
  if (!byGlyph.has(glyph)) {
    const entry = { emoji: glyph, category, name: names[0], names };
    EMOJI.push(entry);
    byGlyph.set(glyph, entry);
  }
  for (const name of names) if (!byName.has(name)) byName.set(name, glyph);
}

// The bar that appears when you hover a message: one tap to react.
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮", "🙏"];

export function isKnownEmoji(value) {
  return typeof value === "string" && byGlyph.has(value);
}

export function emojiForShortcode(name) {
  return byName.get(String(name ?? "").toLowerCase()) ?? null;
}

export function shortcodeFor(glyph) {
  return byGlyph.get(glyph)?.name ?? null;
}

// Picker / autocomplete search, Slack style: the main name starting with
// the query ranks first, then an alias starting with it, then a match
// anywhere; ties go to the shorter name (":fi" offers fire before
// first_place_medal, and both before crossed_fingers' alias
// fingers_crossed). Underscores and spaces are the same.
export function searchEmoji(query, limit = 40) {
  const q = String(query ?? "").toLowerCase().replace(/^:/, "").replace(/:$/, "").replace(/\s+/g, "_");
  if (!q) return [];
  const scored = [];
  EMOJI.forEach((entry, order) => {
    let best = null;
    entry.names.forEach((n, i) => {
      const tier = n.startsWith(q) ? (i === 0 ? 0 : 1) : n.includes(q) ? 2 : null;
      if (tier === null) return;
      if (!best || tier < best.tier || (tier === best.tier && n.length < best.length)) best = { tier, length: n.length };
    });
    if (best) scored.push({ entry, order, ...best });
  });
  scored.sort((a, b) => a.tier - b.tier || a.length - b.length || a.order - b.order);
  return scored.slice(0, limit).map((s) => s.entry);
}

const SHORTCODE = /:([a-z0-9_+-]{1,40}):/gi;

// "nice :fire: :+1:" -> "nice 🔥 👍". Unknown codes stay as typed, so
// "10:30:00" and ":notathing:" are left alone.
export function replaceShortcodes(text) {
  return String(text ?? "").replace(SHORTCODE, (whole, name) => emojiForShortcode(name) ?? whole);
}

// The ":partial" being typed right before the caret, for autocomplete.
// Needs 2+ characters and must start a word, so "10:30" doesn't trigger.
export function shortcodeQueryAt(text, caret) {
  const before = String(text ?? "").slice(0, caret ?? undefined);
  const match = /(^|[\s(])(:([a-z0-9_+-]{2,40}))$/i.exec(before);
  if (!match) return null;
  return { query: match[3].toLowerCase(), start: before.length - match[2].length, end: before.length };
}

// Reaction rows -> chips: [{ emoji, count, mine, userIds }], in the order
// each emoji was first used on the message.
export function groupReactions(rows, viewerId) {
  const sorted = [...(rows ?? [])].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const chips = new Map();
  for (const row of sorted) {
    if (!isKnownEmoji(row.emoji)) continue;
    const chip = chips.get(row.emoji) ?? { emoji: row.emoji, count: 0, mine: false, userIds: [] };
    if (chip.userIds.includes(row.user_id)) continue;
    chip.userIds.push(row.user_id);
    chip.count += 1;
    if (row.user_id === viewerId) chip.mine = true;
    chips.set(row.emoji, chip);
  }
  return [...chips.values()];
}

// Apply a toggle locally (optimistic UI) the same way the server will.
export function toggleReactionRows(rows, { messageId, userId, emoji, now = new Date().toISOString() }) {
  const list = rows ?? [];
  const has = list.some((r) => r.message_id === messageId && r.user_id === userId && r.emoji === emoji);
  return has
    ? list.filter((r) => !(r.message_id === messageId && r.user_id === userId && r.emoji === emoji))
    : [...list, { message_id: messageId, user_id: userId, emoji, created_at: now }];
}
