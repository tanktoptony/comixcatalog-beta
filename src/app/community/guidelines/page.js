import Link from "next/link";

export const metadata = {
  title: "Community Guidelines",
  description: "Ground rules for public profiles, follows, messages and marketplace activity on ComixCatalog.",
};

export default function CommunityGuidelinesPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Community</div>
        <h1>Community Guidelines</h1>
        <p>
          ComixCatalog has public profiles, follows, direct messages and a beta marketplace. A few ground rules keep it a good place to collect.
        </p>
        <h2>The rules</h2>
        <ul>
          <li>Be accurate. List the book you actually have, at the grade you actually believe it is.</li>
          <li>Be respectful in messages. No harassment, slurs or pile-ons.</li>
          <li>No spam, no scams, no off-platform payment schemes. See <Link href="/trust">Trust &amp; Safety</Link> before you trade.</li>
          <li>Don&apos;t upload photos or covers you don&apos;t have the right to share.</li>
        </ul>
        <h2>Reporting</h2>
        <p>Use the Report button on a message or a marketplace listing, or email <a href="mailto:comixcatalog@gmail.com">comixcatalog@gmail.com</a> with a link. We read every report.</p>
        <Link href="/signup" className="primary-btn">
          Create a free account
        </Link>
      </section>
    </main>
  );
}
