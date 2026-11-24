"use client";

// Search collectors and start a conversation. With onPick (the chat dock) a
// result opens in place; without it, results link to /inbox/<username>.

import { useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { authedFetch } from "@/lib/apiClient";

export default function NewMessagePicker({ onClose, onPick }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const response = await authedFetch(`/api/members/search?q=${encodeURIComponent(value)}`, { cache: "no-store" });
      const body = await response.json().catch(() => []);
      if (!cancelled) {
        setPeople(response.ok ? [...body].sort((a, b) => Number(b.following) - Number(a.following)) : []);
        setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  return (
    <div className="inbox-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="inbox-picker" role="dialog" aria-modal="true" aria-labelledby="new-message-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="inbox-picker-head">
          <h2 id="new-message-title">New message</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or usernames" />
        {loading && <p>Searching...</p>}
        {!loading && query.trim().length >= 2 && people.length === 0 && <p>No collectors found.</p>}
        <div className="inbox-picker-results">
          {people.map((person) => (
            <Link
              key={person.id}
              href={`/inbox/${encodeURIComponent(person.username)}`}
              className="inbox-picker-person"
              onClick={(event) => {
                if (onPick) { event.preventDefault(); onPick(person.username); }
                onClose();
              }}
            >
              <Avatar profile={person} />
              <span><strong>{person.display_name || person.username}</strong><small>@{person.username}{person.following ? " · Following" : ""}</small></span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
