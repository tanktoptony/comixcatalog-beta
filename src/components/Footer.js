"use client";

import Image from "next/image";
import Link from "next/link";
import NewsletterSignup from "@/components/NewsletterSignup";

// Footer columns. `data-todo` flags the routes that don't exist yet so we
// can spot them visually during pre-launch QA. Drop the flag once the page
// lands.
const COLUMNS = [
  {
    title: "About",
    links: [
      { label: "Get Started", href: "/get-started" },
      { label: "What is ComixCatalog", href: "/about" },
      { label: "Database", href: "/search" },
      { label: "Marketplace", href: "/marketplace" },
      { label: "Collection", href: "/library" },
      { label: "Wantlist", href: "/library?tab=wishlist" },
      { label: "Collectors", href: "/collectors" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Crate Dig — Chicago", href: "/crate-dig", todo: true },
      { label: "Community Guidelines", href: "/community/guidelines", todo: true },
      { label: "Forum", href: "/forum", todo: true },
      { label: "Reads", href: "/reads" },
      { label: "Danger Room Dispatch", href: "/blog" },
      { label: "Contributor List", href: "/collectors" },
      { label: "Add a Comic", href: "/contribute/add-comic" },
    ],
  },
  {
    title: "Help & Resources",
    links: [
      { label: "Help Center", href: "/help", todo: true },
      { label: "Seller Resources", href: "/sell", todo: true },
      { label: "Submission Guidelines", href: "/contribute/guidelines", todo: true },
      { label: "Trust Center", href: "/trust", todo: true },
      { label: "System Status", href: "/status", todo: true },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

// Real social/contact links pulled from the homepage. Only platforms we
// actually use today — Facebook and X/Twitter intentionally absent.
const SOCIALS = [
  {
    label: "Discord",
    href: "https://discord.gg/aQruGVnD3y",
    icon: "/icons/discord.svg",
    external: true,
  },
  {
    label: "Reddit",
    href: "https://www.reddit.com/r/comixcatalog",
    icon: "/icons/reddit.svg",
    external: true,
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/comixcatalog",
    icon: "/icons/instagram.svg",
    external: true,
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@comixcatalog",
    icon: "/icons/youtube.svg",
    external: true,
  },
  {
    label: "Email",
    href: "mailto:comixcatalog@gmail.com",
    icon: "/icons/mail.svg",
    external: false,
  },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-columns">
          {COLUMNS.map((col) => (
            <nav key={col.title} className="footer-col" aria-label={col.title}>
              <h3 className="footer-col-title">{col.title}</h3>
              <ul className="footer-col-list">
                {col.links.filter((link) => !link.todo).map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="footer-link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* 4th column: newsletter + socials. The form was hidden from
              2026-08 until sending existed; scripts/sendNewsletter.js and
              the unsubscribe route landed 2026-09-22, so it is back. */}
          <div className="footer-col footer-col-newsletter">
            <h3 className="footer-col-title">Newsletter</h3>
            <p className="footer-newsletter-blurb">
              What got added, what got fixed, and which books to go find.
              Every few weeks, from the guy who builds this. No spam, one-click out.
            </p>
            <NewsletterSignup source="footer" compact />

            <h3 className="footer-col-title" style={{ marginTop: "18px" }}>Follow</h3>

            <div className="footer-socials" aria-label="Follow ComixCatalog">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  className="footer-social"
                  aria-label={s.label}
                  title={s.label}
                  {...(s.external
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                >
                  <Image
                    src={s.icon}
                    alt=""
                    width={20}
                    height={20}
                    aria-hidden="true"
                  />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="footer-divider" aria-hidden="true" />

        <Link
          href="/founding-collectors"
          className="footer-founding"
        >
          <div className="footer-founding-text">
            <span className="footer-founding-kicker">Founding Collector</span>
            <span className="footer-founding-headline">
              Free Pro for life
            </span>
            <span className="footer-founding-sub">
              Join while spots remain and your lifetime membership is automatic.
            </span>
          </div>
          <span className="footer-founding-cta">Join →</span>
        </Link>

        <div className="footer-divider" aria-hidden="true" />

        <div className="footer-bottom">
          <Link href="/" className="footer-brand">
            <Image
              src="/img/logos/cc_badge.png"
              alt="ComixCatalog"
              width={36}
              height={36}
              className="footer-badge"
            />
            <span className="footer-brand-text">ComixCatalog</span>
          </Link>

          <p className="footer-tag">
            Built in Chicago by collectors, for collectors.
          </p>

          <div className="footer-meta">
            <p className="footer-copyright">
              © {year} ComixCatalog. All rights reserved.
            </p>
            <p className="footer-meta-line">
              <a href="mailto:comixcatalog@gmail.com" className="footer-meta-link">
                comixcatalog@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
