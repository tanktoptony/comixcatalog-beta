import RequestBookClient from "./RequestBookClient";

export const metadata = {
  title: "Request a book",
  robots: { index: false, follow: false },
};

export default function RequestBookPage() {
  return (
    <main className="scan-page request-page">
      <header className="scan-intro">
        <p className="scan-kicker">Request a book</p>
        <h1 className="scan-title">Can&apos;t find it? Tell us.</h1>
        <p className="scan-lede">
          Tell us what you&apos;re looking for and it goes to the front of our catalog queue.
        </p>
      </header>
      <RequestBookClient />
    </main>
  );
}
