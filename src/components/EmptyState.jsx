"use client";

import Link from "next/link";

/**
 * Standard empty-state block. Used wherever a list or section has no rows yet
 * (empty library, empty profile tab, no search results, etc.).
 *
 * Props:
 *   icon      — optional element (SVG, emoji span) shown above the title
 *   title     — short headline ("No comics yet")
 *   body      — one-line explanation of what this list is and how to fill it
 *   ctaHref   — primary CTA destination
 *   ctaLabel  — primary CTA text ("Browse the database →")
 *   secondary — optional second link, e.g. { href, label }
 *   compact   — tighter padding for inline contexts (profile tabs, side cards)
 */
export default function EmptyState({
  icon = null,
  title,
  body,
  ctaHref = null,
  ctaLabel = null,
  secondary = null,
  compact = false,
}) {
  return (
    <div className={`empty-state ${compact ? "is-compact" : ""}`}>
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      {title && <h3 className="empty-state-title">{title}</h3>}
      {body && <p className="empty-state-body">{body}</p>}
      {(ctaHref || secondary) && (
        <div className="empty-state-actions">
          {ctaHref && ctaLabel && (
            <Link href={ctaHref} className="empty-state-cta">
              {ctaLabel}
            </Link>
          )}
          {secondary?.href && secondary?.label && (
            <Link href={secondary.href} className="empty-state-secondary">
              {secondary.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
