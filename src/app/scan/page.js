import CoverScanner from "@/components/CoverScanner";

export const metadata = {
  title: "Scan a cover | ComixCatalog",
  description: "Take a photo of a comic cover and find the issue in the catalog.",
};

// A destination for "Scan a cover": the homepage hero and the library link
// here, so the scanner isn't only findable on /search.
export default function ScanPage() {
  return (
    <main className="scan-page">
      <header className="scan-intro">
        <p className="scan-kicker">Scan a cover</p>
        <h1 className="scan-title">Snap it. We&apos;ll find the issue.</h1>
        <p className="scan-lede">Take a photo of a comic&apos;s front cover and we match it to the exact issue in the catalog. Add it to your collection or wantlist in one tap.</p>
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
