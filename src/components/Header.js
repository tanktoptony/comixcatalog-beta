"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { user, loading, signOut } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);

  console.log("HEADER USER:", user);

  useEffect(() => {
  const checkAccess = () => {
    setHasAccess(localStorage.getItem("cc_beta_access") === "true");
  };

  checkAccess();

  window.addEventListener("storage", checkAccess);
  window.addEventListener("cc-beta-access", checkAccess);

  return () => {
    window.removeEventListener("storage", checkAccess);
    window.removeEventListener("cc-beta-access", checkAccess);
  };
}, []);


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
          <Link href="/marketplace" className="nav-link add-comic-btn">
            Marketplace
          </Link>
          <Link href="/library" className="nav-link add-comic-btn">
            My Library
          </Link>
          <Link href="/blog" className="nav-link add-comic-btn">
            Developer Blog
          </Link>
          <Link href="/search" className="nav-link add-comic-btn">
            View Comics
          </Link>

          {/* Only beta users who are NOT logged in */}
          {hasAccess && !loading &&!user &&(
            <>
              <Link href="/login" className="nav-link add-comic-btn">
                Login
              </Link>
              <Link href="/signup" className="nav-link add-comic-btn">
                Sign Up
              </Link>
            </>
          )}

          {/* Logged-in users */}
          {user && (
            <button onClick={signOut} className="add-comic-btn nav-link nav-link-logout">
              Logout
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
