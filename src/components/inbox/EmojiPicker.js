"use client";

// Emoji picker popover: search by shortcode, category tabs, grid. Used for
// the message composer (insert) and for reactions (react to a message).
// Closes on Escape or a click outside.

import { useEffect, useMemo, useRef, useState } from "react";
import { EMOJI, EMOJI_CATEGORIES, searchEmoji } from "@/lib/emoji";
import styles from "./EmojiPicker.module.css";

export default function EmojiPicker({ title, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(EMOJI_CATEGORIES[0].id);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    // Phones would pop the keyboard over the grid; only focus with a mouse.
    if (window.matchMedia?.("(hover: hover)").matches) searchRef.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    const onDown = (event) => { if (rootRef.current && !rootRef.current.contains(event.target)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  const shown = useMemo(
    () => (query.trim() ? searchEmoji(query, 64) : EMOJI.filter((e) => e.category === category)),
    [query, category],
  );

  return (
    <div ref={rootRef} className={styles.picker} role="dialog" aria-label={title || "Pick an emoji"}>
      <div className={styles.head}>
        {title && <strong>{title}</strong>}
        <input
          ref={searchRef}
          type="search"
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search: fire, grail, +1…"
          aria-label="Search emoji"
        />
      </div>
      {!query.trim() && (
        <div className={styles.tabs} role="tablist">
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              className={category === c.id ? styles.tabActive : styles.tab}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className={styles.grid}>
        {shown.map((e) => (
          <button key={e.emoji} type="button" className={styles.cell} title={`:${e.name}:`} aria-label={e.name.replace(/_/g, " ")} onClick={() => onPick(e.emoji)}>
            {e.emoji}
          </button>
        ))}
        {shown.length === 0 && <p className={styles.none}>No emoji match “{query.trim()}”.</p>}
      </div>
    </div>
  );
}
