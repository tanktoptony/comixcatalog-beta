// Next.js instrumentation hook — runs once per server runtime start.
// Picks the right Sentry config (Node.js vs Edge) based on the active runtime, and wires
// Sentry's onRequestError hook so server-side errors (API routes, server components,
// server actions) are captured automatically.
// See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config.js");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config.js");
  }
}

export const onRequestError = Sentry.captureRequestError;
