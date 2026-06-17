import Link from "next/link";

// /crate-dig is wallpapered while details (venue, date, RSVP infra) get
// locked in. The fully-built page lives in git history (search for
// "cd-pillars" in this file across older commits) and the CSS in
// globals.css under "── /crate-dig — Chicago in-person event landing"
// is preserved for when we go live again.
//
// Until then, this stub keeps the route reachable (no 404) without
// promising specifics we haven't confirmed.

export const metadata = {
  title: "Crate Dig — Coming Soon",
  description:
    "An in-person comic crate dig in Chicago, hosted by ComixCatalog. Details landing soon.",
};

export default function CrateDigPage() {
  return (
    <main className="cd-stub">
      <div className="cd-stub-inner">
        <div className="cd-stub-pill">Coming soon · Chicago</div>
        <h1 className="cd-stub-title">A crate dig is in the works.</h1>
        <p className="cd-stub-body">
          We&rsquo;re locking in the venue, the date, and the partner shop.
          When details are set, this page lights up with everything you need
          to RSVP. In the meantime, sign up for an account and get your
          wantlist primed &mdash; the whole point of the event is digging
          long boxes with your wantlist already loaded on your phone.
        </p>
        <div className="cd-stub-actions">
          <Link href="/signup" className="cd-stub-btn primary">
            Sign up free
          </Link>
          <Link href="/" className="cd-stub-btn ghost">
            Back to home
          </Link>
        </div>
        <p className="cd-stub-hint">
          Want to know the moment the date drops?{" "}
          <a href="mailto:comixcatalog@gmail.com?subject=Crate%20Dig%20updates">
            Email us
          </a>{" "}
          and we&rsquo;ll put you on the list.
        </p>
      </div>
    </main>
  );
}
