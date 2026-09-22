import NewsletterSignup from "@/components/NewsletterSignup";

export const metadata = {
  title: "The ComixCatalog newsletter",
  description:
    "What got added, what got fixed, and which books to go find. Every few weeks, from the person who builds ComixCatalog. One-click unsubscribe.",
};

// Landing page for the newsletter, so a house ad or a blog post can send
// people somewhere with a form on it. `source="page"` separates it from
// the footer in newsletter_subscribers.
export default function NewsletterPage() {
  return (
    <main className="newsletter-page">
      <h1>The newsletter.</h1>
      <p>
        Every few weeks I send one email: what got added to the catalog, what got fixed,
        which key issues are moving, and one or two books worth going to find. Written by
        me, the guy who builds this, not a marketing department (there is no marketing
        department).
      </p>
      <p>
        No daily drip. No selling your address. One click to leave, at the bottom of every
        email, and it works the first time.
      </p>
      <NewsletterSignup source="page" />
    </main>
  );
}
