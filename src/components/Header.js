"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { user, profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  function closeMenu() {
    setMenuOpen(false);
  }

  async function handleLogout() {
    await signOut();
    setMenuOpen(false);
    router.refresh();
  }

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

        {/* HAMBURGER BUTTON */}
        <button
          className="nav-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        {/* MAIN NAV */}
        {/* MOBILE NAV */}
        <nav className={`main-nav ${menuOpen ? "open" : ""}`}>

          <Link href="/marketplace" className="nav-link" onClick={closeMenu}>
            Marketplace
          </Link>

          <Link href="/library" className="nav-link" onClick={closeMenu}>
            My Library
          </Link>

          <Link href="/blog" className="nav-link" onClick={closeMenu}>
            Developer Blog
          </Link>

          <Link href="/search" className="nav-link" onClick={closeMenu}>
            View Comics
          </Link>

          <Link href="/collectors" className="nav-link" onClick={closeMenu}>
            Founding Collectors
          </Link>

          {!user && (
            <>
              <Link href="/login" className="nav-link" onClick={closeMenu}>Login</Link>
              <Link href="/signup" className="nav-link" onClick={closeMenu}>Sign Up</Link>
            </>
          )}

          {user && (
            <>
              {profile?.username && (
                <Link
                  href={`/u/${profile.username}`}
                  className="nav-link"
                  onClick={closeMenu}
                >
                  My Profile
                </Link>
              )}

              <button onClick={handleLogout} className="nav-link">
                Logout
              </button>
            </>
          )}

        </nav>
      </div>
    </header>
  );
}