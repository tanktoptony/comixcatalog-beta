"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { user, loading, signOut } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);

  console.log("HEADER USER:", user);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasAccess(localStorage.getItem("cc_beta_access") === "true");
      setAccessChecked(true);
    }
  }, []);

  if (!accessChecked) return null;


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

          {/* Only beta users who are NOT logged in */}
          {hasAccess && !user &&(
            <>
              <Link href="/login" className="nav-link">
                Login
              </Link>
              <Link href="/signup" className="nav-link">
                Sign Up
              </Link>
            </>
          )}

          {/* Logged-in users */}
          {user && (
            <button onClick={signOut} className="nav-link nav-link-logout">
              Logout
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
