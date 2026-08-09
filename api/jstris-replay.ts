const JSTRIS_ORIGIN = "https://jstris.jezevec10.com";
const MAX_UPSTREAM_BYTES = 2_000_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
const REPLAY_ID = /^[A-Za-z0-9]+$/;

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function replayPath(id: string, type: "0" | "1"): string { return type === "1" ? `/replay/live/${id}` : `/replay/${id}`; }
function validReplayPayload(value: unknown): value is { c: Record<string, unknown>; d: string } {
  if (!value || typeof value !== "object") return false;
  const record = value as { c?: unknown; d?: unknown };
  return Boolean(record.c && typeof record.c === "object" && typeof record.d === "string");
}

/** Fixed-destination Vercel proxy. Replay simulation remains client-side. */
export async function fetchJstrisReplay(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "GET") { const response = errorResponse("Method not allowed.", 405); response.headers.set("Allow", "GET"); return response; }
  const url = new URL(request.url); const id = url.searchParams.get("id") ?? ""; const type = url.searchParams.get("type") ?? "0";
  if (!REPLAY_ID.test(id) || id.length > 32 || (type !== "0" && type !== "1")) return errorResponse("Invalid Jstris replay identifier.", 400);
  const typed = type as "0" | "1";
  const upstreamUrl = `${JSTRIS_ORIGIN}/replay/data?id=${encodeURIComponent(id)}&type=${typed}`;
  const publicReplayUrl = `${JSTRIS_ORIGIN}${replayPath(id, typed)}`;
  const upstreamInit: RequestInit = {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      Referer: publicReplayUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
    },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };
  let upstream: Response;
  try {
    const warmup = await fetcher(publicReplayUrl, upstreamInit);
    try { upstream = await fetcher(upstreamUrl, upstreamInit); }
    finally { await warmup.body?.cancel().catch(() => undefined); }
  } catch { return errorResponse("Jstris replay service did not respond.", 504); }
  if (!upstream.ok) return errorResponse(upstream.status === 404 ? "Jstris replay was not found." : "Jstris replay service rejected the request.", upstream.status === 404 ? 404 : 502);
  const declaredLength = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPSTREAM_BYTES) return errorResponse("Jstris replay is too large.", 413);
  const raw = await upstream.text(); if (new TextEncoder().encode(raw).byteLength > MAX_UPSTREAM_BYTES) return errorResponse("Jstris replay is too large.", 413);
  let payload: unknown; try { payload = JSON.parse(raw); } catch { return errorResponse("Jstris returned invalid replay data.", 502); }
  if (!validReplayPayload(payload)) return errorResponse("Jstris returned invalid replay data.", 502);
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": typed === "0" ? "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default { fetch(request: Request): Promise<Response> { return fetchJstrisReplay(request); } };
