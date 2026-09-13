// Sentry Node.js (server) runtime initialization — API routes, server components, server actions.
// Loaded by src/instrumentation.js's register() hook when NEXT_RUNTIME === "nodejs".
//
// SETUP REQUIRED: set SENTRY_DSN in .env.local, Vercel project env vars, and GitHub Actions secrets.
// Without a DSN, Sentry.init() below no-ops safely — no events are sent, nothing crashes.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
});
