import CoverScanner from "@/components/CoverScanner";

export const metadata = {
  title: "Scan comics",
  description: "Scan a comic cover or barcode and find the issue in the catalog.",
};

// A destination for "Scan a cover": the homepage hero and the library link
// here, so the scanner isn't only findable on /search.
export default function ScanPage() {
  return (
    <main className="scan-page">
      <header className="scan-intro">
        <p className="scan-kicker">Scan comics</p>
        <h1 className="scan-title">Scan it. We&apos;ll find the issue.</h1>
        <p className="scan-lede">Use the cover or the barcode to find a comic in the catalog, then add it to your collection or wantlist.</p>
      </header>
      <CoverScanner />
      <ul className="scan-tips" aria-label="Tips for a good scan">
        <li><strong>Whole cover in frame.</strong> Corners in, title readable.</li>
        <li><strong>Good light, no glare.</strong> Slide it out of the bag if the plastic shines.</li>
        <li><strong>One book per photo.</strong> Keep other covers out of the shot.</li>
      </ul>
    </main>
  );
}
