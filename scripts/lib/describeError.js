// One faithful way to render a failure, so no script has to invent its own.
//
// Three production incidents in one week (2026-09-21 to 09-23) were all the
// same mistake: code that had the reason for a failure in hand, threw it
// away, and printed a guess instead.
//
//   stall check      `error.message || error.code || "unknown error"`
//                    A PostgREST error carries code, message, details and
//                    hint. The || chain takes the first truthy one and drops
//                    the rest, so a real PGRST002 printed as "unknown error"
//                    and the outage looked like a mystery. (#104)
//
//   format sync      A blanket `continue-on-error: true` meant for the
//                    expected 429 exit also swallowed a hard failure, so the
//                    job was green for a day while syncing zero rows. (#103)
//
//   mislink check    spawnSync's `result.status` was never read. A killed
//                    child was reported as "could not parse output", which
//                    points at the wrong file entirely. (#114)
//
// The common failure is not "forgot to handle an error". It is *inferring*
// the reason instead of reporting what was already known. This module exists
// so the faithful version is the easy version.
//
// Usage:
//   import { describeError, describeExit } from "./lib/describeError.js";
//   if (error) throw new Error(`series walk: ${describeError(error)}`);
//   if (result.status !== 0) console.error(describeExit(result));

// Supabase/PostgREST errors are plain objects, not Error instances, so
// console.error(err) prints "{ code: '57014', ... }" with no indication of
// which query died, and err.message alone can be empty.
export function describeError(error) {
  if (error == null) return "no error object (the caller reported a failure without one)";
  if (typeof error === "string") return error;

  const parts = [];
  if (error.code) parts.push(String(error.code));
  if (error.message) parts.push(String(error.message));
  if (error.details) parts.push(`details: ${error.details}`);
  if (error.hint) parts.push(`hint: ${error.hint}`);

  if (parts.length) return parts.join(" | ");

  // An Error subclass with an empty message, or some shape we have not seen.
  // Print it rather than claim it is unknown — "unknown error" is the thing
  // this module exists to stop.
  if (error instanceof Error) return error.stack || error.name || "Error with no message";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// spawnSync result. A null status with no signal on some platforms, or a
// signal on others, both mean the child was killed from outside — that is
// worth saying out loud, because it looks nothing like a bug in the child's
// own output format.
export function describeExit(result) {
  if (!result) return "no spawn result";
  if (result.error) return `failed to start: ${describeError(result.error)}`;

  const bits = [`exit code ${result.status ?? "null"}`];
  if (result.signal) bits.push(`signal ${result.signal}`);
  let text = bits.join(", ");
  if (result.signal || result.status === null) {
    text +=
      " — a null status or a signal with no stack trace means the process was " +
      "killed from outside (out of memory is the common cause for the big walks here)";
  }
  return text;
}

// For the very common `const { data, error } = await supabase...` shape.
// Throws with a named context instead of letting a failed query masquerade
// as an empty result, which is the single most repeated bug in this repo.
export function unwrap({ data, error }, context) {
  if (error) throw new Error(`${context}: ${describeError(error)}`);
  return data;
}
