import Anthropic from "@anthropic-ai/sdk";
import { AI_SUGGEST_MODEL, AI_SUGGEST_SCHEMA, AI_SUGGEST_SYSTEM, buildSuggestPrompt, parseSuggestions } from "./aiSuggest.js";

// One model call for up to AI_SUGGEST_BATCH rows. Same request shape as the
// cover scan (src/lib/coverScanClaude.js): structured output, low effort,
// and the server-side refusal fallback.
export async function suggestImportRows(rows) {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error("ANTHROPIC_API_KEY is not configured"), { status: 503 });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.create({
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    model: AI_SUGGEST_MODEL, max_tokens: 16000,
    system: AI_SUGGEST_SYSTEM,
    messages: [{ role: "user", content: buildSuggestPrompt(rows) }],
    output_config: { effort: "low", format: { type: "json_schema", schema: AI_SUGGEST_SCHEMA } },
  });
  return { suggestions: parseSuggestions(response, rows.map((row) => row.i)), usage: response.usage };
}
