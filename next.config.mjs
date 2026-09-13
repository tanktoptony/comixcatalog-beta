import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,

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
