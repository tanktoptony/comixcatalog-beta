import CoverScanner from "@/components/CoverScanner";

export const metadata = {
  title: "Scan a cover | ComixCatalog",
  description: "Take a photo of a comic cover and find the issue in the catalog.",
};

// A destination for "Scan a cover": the homepage hero and the library link
// here, so the scanner isn't only findable on /search.
export default function ScanPage() {
  return (
    <main className="page-wrapper">
      <section className="comic-panel">
        <div className="section-label badge-x">Scan</div>
        <h1 className="hero-title">Scan a cover</h1>
        <p className="muted">Snap the cover, get the issue. Add it to your collection or wantlist in one tap.</p>
        <CoverScanner />
      </section>
    </main>
  );
}
