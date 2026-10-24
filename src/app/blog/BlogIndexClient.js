"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_ID } from "@/lib/admin";

// On phones the ledger sits above the posts, so it starts short.
const PHONE_PREVIEW = 4;

function formatUpdateDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// The same hand-written site updates the homepage Dispatch shows
// (src/lib/siteNews.js), as a running ledger beside the posts.
function UpdatesLedger({ updates }) {
  const [expanded, setExpanded] = useState(false);
  if (!updates.length) return null;
  return (
    <aside className="blog-ledger" id="updates" aria-labelledby="blog-ledger-title">
      <h2 id="blog-ledger-title" className="blog-ledger-title">Site updates</h2>
      <ol className={`blog-ledger-list${expanded ? " is-expanded" : ""}`}>
        {updates.map((item, index) => (
          <li key={`${item.date}-${item.title}`} className={index >= PHONE_PREVIEW ? "blog-ledger-extra" : undefined}>
            <time className="blog-ledger-date" dateTime={item.date}>{formatUpdateDate(item.date)}</time>
            <h3 className="blog-ledger-item-title">
              {item.href ? <Link href={item.href} prefetch={false}>{item.title}</Link> : item.title}
            </h3>
            <p className="blog-ledger-body">{item.body}</p>
          </li>
        ))}
      </ol>
      {updates.length > PHONE_PREVIEW && !expanded && (
        <button type="button" className="blog-ledger-more" onClick={() => setExpanded(true)}>
          Show all {updates.length} updates
        </button>
      )}
    </aside>
  );
}

// initialPosts comes from the server render (page.js); null falls back to the
// client fetch.
export default function BlogIndexClient({ initialPosts = null, updates = [] }) {
  const [posts, setPosts] = useState(initialPosts ?? []);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const isAdmin = user?.id === ADMIN_ID;

  useEffect(() => {
    if (initialPosts) return;

    async function loadPosts() {
      const res = await fetch("/api/blog");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load posts");
        return;
      }

      setPosts(data.posts || []);
    }

    loadPosts();
  }, [initialPosts]);

  return (
    <section className="blog-page">
      <div className="blog-header-row">
        <div>
          <div className="blog-eyebrow">Developer Updates</div>
          <h1 className="blog-title">Danger Room Dispatch</h1>
          <p className="blog-subtitle">
            Behind-the-scenes notes from Tony about what shipped, what changed,
            and how ComixCatalog gets built.
          </p>
        </div>
        {isAdmin && (
          <Link href="/blog/create" className="blog-new-btn" title="Create a new blog post">
            + New post
          </Link>
        )}
      </div>

      {error && <p className="cc-form-error">{error}</p>}

      <div className="blog-layout">
        <UpdatesLedger updates={updates} />

        <div className="blog-list">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="blog-card"
            >
              <div className="blog-card-date">
                {new Date(post.created_at).toLocaleDateString()}
              </div>

              <div className="blog-card-title">
                {post.title}
              </div>

              <div className="blog-card-excerpt">
                {post.excerpt}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
