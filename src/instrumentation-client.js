// Sentry browser/client initialization.
// Next.js App Router loads this automatically (file-convention: src/instrumentation-client.js).
// See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
//
// SETUP REQUIRED (not done yet — see docs/LAUNCH_CHECKLIST.md "API/server error rate < 1%"):
//   1. Create a Sentry project (sentry.io), get its DSN.
//   2. Set NEXT_PUBLIC_SENTRY_DSN in .env.local, Vercel project env vars, and GitHub Actions secrets.
// Without a DSN, Sentry.init() below no-ops safely — no events are sent, nothing crashes.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Keep trace volume low by default — comic-catalog traffic doesn't need full tracing yet.
  // Raise this (or make it env-driven) once real production data justifies the cost.
  tracesSampleRate: 0.1,

  // Session Replay is off by default (extra cost + PII surface area). Turn on deliberately later.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  debug: false,
});

// Required by the current SDK for App Router navigation instrumentation (this export only
// resolves in the browser bundle — a plain `node -e "require('@sentry/nextjs')"` check won't
// show it, that's the Node.js export condition, not the browser one this file actually uses).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
