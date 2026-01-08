"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

export default function Header() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasAccess(localStorage.getItem("cc_beta_access") === "true");
    }
  }, []);

  useEffect(() => {
    // 1️⃣ Load initial session
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    // 2️⃣ Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    // no hard refresh needed — auth listener updates UI
  }

  if (loading) return null;

  return (
    <header className="site-header">
      <div className="header-inner">
        {/* BRAND */}
        <Link href="/" className="brand" aria-label="ComixCatalog home">
          <Image
            src="/img/logos/cc_badge.png"
            alt="ComixCatalog badge"
            width={40}
            height={40}
            className="logo-badge"
            priority
          />
          <div className="brand-block">
            <div className="brand-title">
              <span className="brand-main">COMIXCATALOG</span>
            </div>
            <div className="brand-sub">Catalog. Collect. Connect.</div>
          </div>
        </Link>

        {/* MAIN NAV */}
        <nav className="main-nav" aria-label="Primary navigation">
          <Link href="/marketplace" className="nav-link">
            Marketplace
          </Link>

          <Link href="/library" className="nav-link">
            My Library
          </Link>

          <Link href="/news" className="nav-link">
            News & Updates
          </Link>

          <Link href="/search" className="nav-link">
            Search
          </Link>

          {!user && hasAccess && (
            <>
              <Link href="/login" className="nav-link">
                Login
              </Link>
              <Link href="/signup" className="nav-link">
                Sign Up
              </Link>
            </>
          )}

          {user && (
            <button onClick={handleLogout} className="nav-link nav-link-logout">
              Logout
            </button>
          )}
        </nav>

        {/* CTA */}
        {/* <div className="header-cta">
          <Link
            href="/signup?ref=founding"
            className="landing-btn landing-btn-primary"
          >
            Become a Founding Collector
          </Link>
        </div> */}
      </div>
    </header>
  );
}
