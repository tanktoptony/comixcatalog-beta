// Skeleton privacy policy. Generic SaaS-style starter copy — hand to a
// lawyer for review before going live with paid Stripe traffic. The
// substance of what we actually collect/process is accurate as of writing
// (Supabase auth, ComicVine + GCD ingestion, Stripe billing); the legal
// language is placeholder.

export const metadata = {
  title: "Privacy Policy · ComixCatalog",
  description: "How ComixCatalog collects, uses, and protects your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <article className="legal-prose">
        <p className="legal-kicker">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="legal-meta">Last updated: April 2026</p>

        <p>
          ComixCatalog (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the website at
          comixcatalog.com (the &ldquo;Service&rdquo;). This Privacy Policy explains what
          information we collect, how we use it, and the choices you have. By
          using the Service, you agree to the practices described here.
        </p>

        <h2>1. Information We Collect</h2>
        <p>
          <strong>Account information.</strong> When you create an account we
          collect your email address, a username, and a hashed password. If
          you sign in with a third-party provider (Google, etc.), we receive
          your email and basic profile from that provider.
        </p>
        <p>
          <strong>Profile information.</strong> Anything you choose to add to
          your public profile — display name, avatar, bio, badges — is stored
          and shown according to your privacy settings.
        </p>
        <p>
          <strong>Collection data.</strong> Books you add to your collection or
          wishlist, conditions, grades, slab cert numbers, prices paid, market
          values, notes, and any cover photos you upload.
        </p>
        <p>
          <strong>Payment information.</strong> Subscription and marketplace
          payments are processed by Stripe. We do not store your full card
          number on our servers; Stripe holds that data subject to its own
          policies.
        </p>
        <p>
          <strong>Usage data.</strong> Standard server logs (IP, user agent,
          pages visited, timestamps), error reports, and basic analytics so we
          can keep the site working.
        </p>
        <p>
          <strong>Cookies.</strong> Session cookies for authentication, and
          functional cookies for things like &ldquo;remember my filters.&rdquo; No
          third-party advertising trackers.
        </p>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To provide and operate the Service.</li>
          <li>To process subscription payments and marketplace transactions.</li>
          <li>To send transactional email (receipts, password resets, order updates).</li>
          <li>
            To send product updates and newsletters, only if you opt in. You
            can unsubscribe at any time from any newsletter email.
          </li>
          <li>To prevent fraud and abuse.</li>
          <li>To comply with legal obligations.</li>
        </ul>

        <h2>3. Data Sources We Rely On</h2>
        <p>
          ComixCatalog&rsquo;s comic database draws metadata from the{" "}
          <strong>Grand Comics Database (GCD)</strong> and cover imagery from{" "}
          <strong>ComicVine</strong>. We do not collect your personal data
          from these services; they are reference sources for comic metadata
          only.
        </p>

        <h2>4. Sharing</h2>
        <p>We share information only with:</p>
        <ul>
          <li>
            <strong>Service providers</strong> who help us run the Service —
            Supabase (database + auth + storage), Stripe (payments),
            transactional email providers — under contracts that limit their
            use of your data.
          </li>
          <li>
            <strong>Other users,</strong> for any data you make public on
            your profile or in the marketplace (collection display, listings,
            comments).
          </li>
          <li>
            <strong>Authorities,</strong> if required by valid legal process.
          </li>
        </ul>
        <p>We do not sell your personal data.</p>

        <h2>5. Your Rights</h2>
        <p>You can:</p>
        <ul>
          <li>Access, update, or delete the personal information in your account at any time from Account Settings.</li>
          <li>Make your profile private to remove it from public view.</li>
          <li>Export a copy of your collection data.</li>
          <li>Request full account deletion by contacting us at the email below.</li>
        </ul>
        <p>
          If you are in the EU/UK, California, or another jurisdiction with
          additional data-protection rights, those rights apply to you. We
          will respond to verified requests within the timeframes that law
          requires.
        </p>

        <h2>6. Security</h2>
        <p>
          We use industry-standard practices — TLS in transit, hashed
          passwords, role-based database access — to protect your data. No
          system is perfectly secure; if we ever discover a breach affecting
          your account, we will notify you as required by law.
        </p>

        <h2>7. Children</h2>
        <p>
          The Service is not directed to children under 13. If we learn we
          have collected personal information from a child under 13, we will
          delete it.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material
          changes will be announced on the Service or by email. The &ldquo;Last
          updated&rdquo; date at the top reflects the most recent revision.
        </p>

        <h2>9. Contact</h2>
        <p>
          Questions, requests, or complaints? Email us at{" "}
          <a href="mailto:comixcatalog@gmail.com">comixcatalog@gmail.com</a>.
          We&rsquo;re a small, Chicago-based team and we&rsquo;ll get back to you.
        </p>
      </article>
    </main>
  );
}
