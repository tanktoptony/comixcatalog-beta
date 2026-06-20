"use client";

// Anon-visitor conversion banner for /u/[username]. Renders only when the
// visitor is signed out. Server-side auth in the parent page returns null
// even for signed-in users (plain createClient with ANON_KEY doesn't read
// Next.js cookies), so we gate this client-side instead.

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function ProfileAnonCta() {
  const { user, loading } = useAuth();
  if (loading || user) return null;

  return (
    <section className="profile-anon-cta">
      <div className="profile-anon-cta-inner">
        <div>
          <strong>Track your own collection.</strong>{" "}
          Free to start &mdash; catalog every issue, grade, and value in one place.
        </div>
        <Link href="/signup" className="profile-anon-cta-btn">
          Start free →
        </Link>
      </div>
    </section>
  );
}
