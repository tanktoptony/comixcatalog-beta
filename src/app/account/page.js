"use client";

import Link from "next/link";

export default function AccountPage() {
  // eventually this will pull user info from context or API
  const user = { name: "Origin Collector", email: "collector@example.com" };

  return (
    <section className="auth-panel">
      <h1 className="auth-title">My Account</h1>
      <p style={{ textAlign: "center" }}>
        <strong>{user.name}</strong>
        <br />
        {user.email}
      </p>

      <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
        <Link href="/library" className="landing-btn landing-btn-primary">
          View My Library
        </Link>
        <br />
        <Link
          href="/search"
          className="landing-btn landing-btn-secondary"
          style={{ marginTop: "0.5rem" }}
        >
          Explore Comics
        </Link>
      </div>
    </section>
  );
}
