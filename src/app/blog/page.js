"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function BlogIndexPage() {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
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
  }, []);

  return (
    <section className="comic-panel news-page">
      <div className="section-label badge-x">Developer Updates</div>
      <h1 className="hero-title mb-6">ComixCatalog Blog</h1>

      {error && <p className="error">{error}</p>}

      {posts.length === 0 && !error && (
        <p>No posts published yet.</p>
      )}

      {posts.map((post) => (
        <article key={post.id} className="news-post mb-10">
          <h2>
            <Link href={`/blog/${post.slug}`}>
              {post.title}
            </Link>
          </h2>

          <p className="news-post-date">
            {post.published_at
              ? new Date(post.published_at).toLocaleDateString()
              : ""}
          </p>

          <p>
            {post.excerpt || post.content.slice(0, 200)}...
          </p>
        </article>
      ))}
    </section>
  );
}


/*
export default function NewsPage() {
  const updates = [
    {
      title: "Welcome to ComixCatalog (Beta)",
      date: "January 2026",
      body: (
        <>
          <p>
            BETA IS NOW LIVE! Guys, I can't tell you how excited I am to share
            this first step with you. And let me be clear: that is exactly what
            this is — only a first step.
          </p>

          <p>
            This will not be the most robust website you have encountered, but
            the first and most important features are here: searching issues,
            viewing detailed pages, and organizing your Collection and Wishlist.
          </p>

          <p>Some things to note as you get started:</p>

          <ul>
            <li>This is a beta, so expect bugs and rough edges.</li>
            <li>The database is user-powered for now.</li>
            <li>Your collections and wishlists are private by default.</li>
            <li>
              Future features will include pricing tools and a marketplace.
            </li>
          </ul>

          <p>Imminent changes include:</p>

          <ul>
            <li>Improved mobile responsiveness</li>
            <li>User profiles and public collections</li>
            <li>Community features (comments, reviews, messaging)</li>
            <li>Additional data fields on issue pages</li>
            <li>Better error handling and loading states</li>
            <li>Patreon perk implementation</li>
            <li>Potential AI image recognition</li>
          </ul>

          <p>
            <strong>
              All of this before we institute the marketplace and deliver the
              complete online comic collecting experience you deserve.
            </strong>
          </p>

          <p>
            Thank you all for even the small modicum of interest we've managed
            to generate so far. If you'd like to support further and still be
            part of the founding collectors guild, please consider donating to
            our{" "}
            <a
              href="https://www.patreon.com/comixcatalog"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Patreon
            </a>{" "}
            to assist with development costs.
          </p>

          <p>
            Happy New Year, and thanks again for joining the party.
            <br />
            Excelsior!
            <br />
            – Anthony
            <br />
            Founder, ComixCatalog
          </p>
        </>
      ),
    },
    {
      title: "Welcome to ComixCatalog (Beta)",
      date: "December 2025",
      body: `
ComixCatalog is an early beta focused on one core idea: giving comic collectors a clean, trustworthy way to track what they own and what they want.

Right now, you can search issues, view detailed pages, and organize your Collection and Wishlist. This beta is intentionally narrow — the goal is to get the foundation right before expanding into pricing tools, larger datasets, and marketplace features.

If you’re using ComixCatalog at this stage, you’re helping shape what it becomes. Feedback, bug reports, and feature ideas are not just welcome — they’re essential.
      `,
    },
    {
      title: "ComixCatalog Origin Update #1",
      date: "November 2025",
      body: `
ComixCatalog began as a personal solution for collectors who were tired of vague listings, missing covers, and incomplete databases across existing platforms.

Over the past month, the focus has been on rebuilding the front-end, establishing a clear collection vs wishlist model, and laying the groundwork for verified cataloging. Next up: expanding data coverage and preparing a small Founding Collectors test group.
      `,
    },
  ];
  

  return (
    <section className="comic-panel news-page">
      <div className="section-label badge-x">News & Updates</div>
      <h1 className="hero-title mb-6">ComixCatalog Developer Updates</h1>

      {updates.map((post, i) => (
        <article key={i} className="news-post mb-10">
          <h2>{post.title}</h2>

          <p className="news-post-date">{post.date}</p>

          <div className="news-post-body whitespace-pre-line">
            {typeof post.body === "string" ? post.body.trim() : post.body}
          </div>
        </article>
      ))}
    </section>
  );
}
  */
