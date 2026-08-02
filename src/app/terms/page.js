// Skeleton terms of service. Generic SaaS-style starter copy — hand to a
// lawyer for review before going live with paid Stripe traffic and the
// marketplace launch. Mentions Stripe billing, marketplace mechanics,
// user-contributed content, and intellectual property in the right shape.

export const metadata = {
  title: "Terms of Service · ComixCatalog",
  description: "The rules and agreements that govern your use of ComixCatalog.",
};

export default function TermsOfServicePage() {
  return (
    <main className="legal-page">
      <article className="legal-prose">
        <p className="legal-kicker">Legal</p>
        <h1>Terms of Service</h1>
        <p className="legal-meta">Last updated: April 2026</p>

        <p>
          Welcome to ComixCatalog. These Terms of Service (&ldquo;Terms&rdquo;) govern
          your access to and use of comixcatalog.com and any related services
          (collectively, the &ldquo;Service&rdquo;) operated by ComixCatalog
          (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By using the Service, you agree to be
          bound by these Terms. If you don&rsquo;t agree, don&rsquo;t use the Service.
        </p>

        <h2>1. Eligibility</h2>
        <p>
          You must be at least 13 years old to create an account. If you are
          under 18, you may only use the Service with the involvement of a
          parent or guardian.
        </p>

        <h2>2. Your Account</h2>
        <p>
          You are responsible for keeping your login credentials confidential
          and for all activity under your account. Notify us immediately if
          you suspect unauthorized access. We may suspend or terminate
          accounts that violate these Terms or that we reasonably believe
          pose risk to other users or the Service.
        </p>

        <h2>3. User Content</h2>
        <p>
          You retain ownership of the comic photos, descriptions, notes,
          reviews, listings, and other content you contribute to the Service
          (&ldquo;User Content&rdquo;). By posting User Content you grant us a
          worldwide, royalty-free license to host, display, and distribute it
          as needed to operate the Service. You represent that you have the
          right to post any User Content you submit.
        </p>
        <p>
          We may remove User Content that violates these Terms, our
          Community Guidelines, or applicable law.
        </p>

        <h2>4. Subscriptions</h2>
        <p>
          Some features of the Service require a paid Collector Pro subscription. Subscriptions are
          billed in advance on a monthly basis through Stripe. Your
          subscription will renew automatically until you cancel.
        </p>
        <p>
          A limited number of Founding Collector passes provide the standard
          Collector Pro feature set without a recurring charge. These passes
          are non-transferable and remain valid for the lifetime of the account
          and the ComixCatalog service, subject to these Terms.
        </p>
        <p>
          You can cancel at any time from Account Settings. Cancellation
          takes effect at the end of the current billing period; you keep
          access to paid features until that date. We do not provide
          pro-rated refunds for partial periods unless required by law.
        </p>
        <p>
          We may change subscription pricing with at least 30 days&rsquo; notice.
          Continued use after a price change constitutes acceptance of the
          new price.
        </p>

        <h2>5. Marketplace</h2>
        <p>
          The Service may include a marketplace allowing users to list
          collectibles for sale to other users. ComixCatalog is a venue
          only — we are not a party to transactions between buyers and
          sellers. Disputes are resolved between the parties, with our
          help where appropriate.
        </p>
        <p>
          Sellers are responsible for accurately describing items, complying
          with all applicable laws (including taxes), and shipping promptly.
          Buyers are responsible for paying for items they purchase. We
          charge a transaction fee on each completed sale, disclosed before
          listing.
        </p>

        <h2>6. Database Contributions</h2>
        <p>
          ComixCatalog&rsquo;s comic database is community-built and draws on the
          public Grand Comics Database (GCD). Contributions you submit to
          improve the database (corrections, missing issues, variants) become
          part of the canonical dataset and may be displayed to all users.
        </p>

        <h2>7. Prohibited Conduct</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any illegal purpose or in violation of any law.</li>
          <li>Post fraudulent listings, counterfeit goods, or items you do not own.</li>
          <li>Harass, abuse, threaten, or impersonate other users.</li>
          <li>Scrape, mass-download, or otherwise extract data without our written permission.</li>
          <li>Reverse-engineer or interfere with the technical operation of the Service.</li>
          <li>Use the Service to transmit malware or other harmful code.</li>
        </ul>

        <h2>8. Intellectual Property</h2>
        <p>
          The Service, including its design, code, and original content, is
          owned by ComixCatalog and protected by copyright, trademark, and
          other laws. Comic cover artwork and metadata sourced from third
          parties (ComicVine, GCD, publishers) remain the property of their
          respective owners and are displayed for reference and discovery
          purposes.
        </p>

        <h2>9. Termination</h2>
        <p>
          You can stop using the Service and delete your account at any
          time. We may suspend or terminate access if you breach these
          Terms or if continued operation poses risk to us or other users.
          Sections that by their nature should survive termination
          (ownership, disclaimers, limitations of liability, governing law)
          will survive.
        </p>

        <h2>10. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
          WARRANTIES OF ANY KIND. We do not guarantee that the Service will
          be uninterrupted, error-free, or secure, or that comic data
          (including pricing estimates and grade references) will be
          accurate. Collectible values fluctuate and any estimates shown are
          informational, not appraisals.
        </p>

        <h2>11. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, COMIXCATALOG WILL NOT BE
          LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR
          PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUES, OR DATA, ARISING
          FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM
          WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE
          THE CLAIM AROSE.
        </p>

        <h2>12. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the State of Illinois,
          USA, without regard to its conflict-of-laws principles. Any
          dispute will be resolved in the state or federal courts located
          in Cook County, Illinois.
        </p>

        <h2>13. Changes</h2>
        <p>
          We may revise these Terms from time to time. Material changes
          will be announced on the Service or by email. Continued use of
          the Service after changes take effect constitutes acceptance.
        </p>

        <h2>14. Contact</h2>
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:comixcatalog@gmail.com">comixcatalog@gmail.com</a>.
        </p>
      </article>
    </main>
  );
}
