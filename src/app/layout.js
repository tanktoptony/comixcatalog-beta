import Script from "next/script";
import { Big_Shoulders_Display } from "next/font/google";
import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import FoundingBanner from "../components/FoundingBanner";
import OnboardingModal from "../components/OnboardingModal";
import { LibraryProvider } from "../context/LibraryContext";
import { AuthProvider } from "../context/AuthContext";

// Display face for the public profile ("The Case") — a deliberate contrast
// with /library's plain grotesk, part of the workshop/showcase split
// (2026-08-27). Exposed as a CSS var rather than a global font-family swap
// so it stays opt-in per element; /library never references it.
const displayFont = Big_Shoulders_Display({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://comixcatalog.com";
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
// Production only — keeps localhost/dev traffic out of real GA data.
const GA_ENABLED = Boolean(GA_MEASUREMENT_ID) && process.env.NODE_ENV === "production";
const SITE_NAME = "ComixCatalog";
const DEFAULT_TITLE = "ComixCatalog — Catalog. Collect. Connect.";
const DEFAULT_DESCRIPTION =
  "The database, collection manager, and marketplace for comic books. " +
  "Search any issue, catalog what you own, track its value, and trade with " +
  "full grade transparency. Built by collectors, for collectors.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    // %s is replaced per-page when child pages set their own title.
    template: "%s — ComixCatalog",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "comic books",
    "comic book database",
    "comic collection",
    "comic marketplace",
    "CGC",
    "CBCS",
    "key issues",
    "comic book grading",
    "comic book value",
    "comic price guide",
    "GCD",
    "Grand Comics Database",
  ],
  authors: [{ name: "ComixCatalog" }],
  creator: "ComixCatalog",
  publisher: "ComixCatalog",
  // Open Graph — controls preview cards on Facebook, Discord, iMessage,
  // Slack, LinkedIn, Reddit, and most other link-unfurlers.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    // The og:image itself is wired by src/app/opengraph-image.js — Next
    // generates the 1200×630 dynamically with real cover art from the
    // canonical-covers bucket. No static asset to maintain.
  },
  // Twitter / X card. summary_large_image gives the big preview tile
  // collectors are used to seeing on Discogs / Letterboxd / etc.
  // Image is shared via opengraph-image.js — Twitter falls back to it
  // when twitter:image is absent.
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    creator: "@comixcatalog",
    site: "@comixcatalog",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/favicon/site.webmanifest",
};

// Next 16 moved themeColor (and a few others) out of `metadata` and into a
// separate `viewport` export. Same value, new home — kills the build warning.
//
// `width: "device-width"` and `initialScale: 1` are the critical mobile
// fix: without them, mobile browsers render the page at a default ~980px
// "desktop" width and scale it down, producing the "zoomed in, won't side
// scroll" symptom users reported on issue/series pages. With both set, the
// page renders at the device's actual viewport.
export const viewport = {
  themeColor: "#15171f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`page-shell ${displayFont.variable}`}>
        {GA_ENABLED && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
        <AuthProvider>
          <LibraryProvider>
            <FoundingBanner />
            <Header />
            {/* Mounted once, globally, so it can fire wherever a signed-in
                user's first page load actually lands (post-signup that's
                /u/[username], not "/") — see OnboardingModal.js. */}
            <OnboardingModal />
            <main className="page-wrapper">{children}</main>
            <Footer />
          </LibraryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
