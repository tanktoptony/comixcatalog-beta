import { withSentryConfig } from "@sentry/nextjs/config";

const SHARP_BINARIES = ["./node_modules/@img/sharp-linux-x64/**/*", "./node_modules/@img/sharp-libvips-linux-x64/**/*"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,

  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self)" },
      ],
    }];
  },

  // The share card reads its bundled TTFs from disk at runtime; tracing
  // cannot see a readFile path, so name the folder explicitly or Vercel
  // ships the route without them.
  //
  // sharp loads its native libvips library (libvips-cpp.so) at runtime,
  // and the Turbopack trace doesn't follow it: the photo route crashed in
  // production with "libvips-cpp.so.8.18.6: cannot open shared object file"
  // (2026-10-02). Ship the Linux binaries with every route that imports
  // sharp. The PDF export imports it too.
  outputFileTracingIncludes: {
    "/api/share-card": ["./src/app/api/share-card/fonts/**"],
    "/opengraph-image": ["./src/assets/og-fonts/**"],
    "/*/opengraph-image": ["./src/assets/og-fonts/**"],
    "/*/*/opengraph-image": ["./src/assets/og-fonts/**"],
    "/api/listings/photos/process": SHARP_BINARIES,
    "/api/export/pdf": SHARP_BINARIES,
  },

  // /about and /get-started were folded into /start (2026-10-01): three
  // pages explained the same thing. Permanent so search engines move over.
  async redirects() {
    return [
      { source: "/about", destination: "/start", permanent: true },
      { source: "/get-started", destination: "/start", permanent: true },
      { source: "/collectors", destination: "/founding-collectors", permanent: true },
      // Short link for the Instagram bio. Temporary (302) on purpose: point
      // it at whatever the current push is without touching the bio again.
      // The utm tags ride along so first-touch attribution counts these
      // signups (src/lib/attribution.js).
      {
        source: "/ig",
        destination: "/founding-collectors?utm_source=instagram&utm_medium=social&utm_campaign=vs-incumbents",
        permanent: false,
      },
      // One link per post in the "why ComixCatalog" carousel series, printed
      // on each post's last slide, e.g. /ig/grades. The slug becomes
      // utm_content so signups can be credited to the post that sent them.
      {
        source: "/ig/:post([a-z0-9-]{2,40})",
        destination: "/founding-collectors?utm_source=instagram&utm_medium=social&utm_campaign=vs-incumbents&utm_content=:post",
        permanent: false,
      },
      // Short link for YouTube videos. Temporary (302) so the destination can
      // follow the current campaign without changing published descriptions.
      {
        source: "/yt",
        destination: "/founding-collectors?utm_source=youtube&utm_medium=video&utm_campaign=founding-wall",
        permanent: false,
      },
      // Printed comic shop kit (bookmarks and counter checklists): one QR
      // link per shop, e.g. /s/challengers. Temporary for the same reason as
      // /ig; the shop slug becomes utm_source so signups are credited to it.
      {
        source: "/s/:shop([a-z0-9-]{2,40})",
        destination: "/founding-collectors?utm_source=:shop&utm_medium=print&utm_campaign=shop-kit",
        permanent: false,
      },
      // Short link for texting a buyer a listing (first test purchase,
      // 2026-10-24). Temporary so it can be repointed at the next listing.
      {
        source: "/buy",
        destination: "/listing/039eb7af-79b7-4ae6-9a76-de75af3c5e4b",
        permanent: false,
      },
      { source: "/forum", destination: "/", permanent: false },
      { source: "/crate-dig", destination: "/", permanent: false },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.comics.org",
        pathname: "/**",
      },
    ],
  },
};

// Sentry build-time wrapper: enables source map upload for readable stack traces in
// production. Source map upload only activates once SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN
// are set (Vercel + GitHub Actions secrets) — until then this safely skips uploading and the
// build behaves exactly as it did before Sentry was added.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Don't spam build logs; only get verbose in CI where it's useful to debug upload issues.
  silent: !process.env.CI,

  sourcemaps: {
    // No auth token yet (founder hasn't created a Sentry project/token) -> skip upload entirely
    // rather than fail or warn noisily on every build.
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Don't let Sentry's build plugin phone home for its own telemetry.
  telemetry: false,
});
