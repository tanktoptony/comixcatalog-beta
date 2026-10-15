import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  const startedAt = performance.now();

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { error } = await supabase
      .from("series")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(5_000));

    if (error) throw error;

    return Response.json(
      { ok: true, db_ms: Math.round(performance.now() - startedAt) },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    // The public health response must not expose database or configuration details.
    console.error("Health check failed", error);
    return Response.json({ ok: false }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
