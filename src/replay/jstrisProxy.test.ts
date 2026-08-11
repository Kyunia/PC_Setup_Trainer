import { describe, expect, it, vi } from "vitest";
import { fetchJstrisReplay, MAX_UPSTREAM_BYTES } from "../../api/jstris-replay";

const payload = { c: { v: 3.3, seed: "proxy-seed", m: 524289, r: 0 }, d: "encoded-actions" };
function request(query = "id=92072007&type=0", method = "GET"): Request {
  return new Request(`https://trainer.example/api/jstris-replay?${query}`, { method });
}

describe("Vercel Jstris replay proxy", () => {
  it("returns raw replay JSON from the fixed Jstris endpoint", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("challenge", { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await fetchJstrisReplay(request(), fetcher as typeof fetch);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://jstris.jezevec10.com/replay/92072007");
    expect(String(fetcher.mock.calls[1]?.[0])).toBe("https://jstris.jezevec10.com/replay/data?id=92072007&type=0");
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("referer")).toBe("https://jstris.jezevec10.com/replay/92072007");
  });

  it("does not cache live replay responses", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("warm", { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    const response = await fetchJstrisReplay(request("id=abc123&type=1"), fetcher as typeof fetch);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("referer")).toBe("https://jstris.jezevec10.com/replay/live/abc123");
  });

  it("returns a gateway error when Jstris rejects the data request", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("challenge", { status: 403 }))
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }));

    const response = await fetchJstrisReplay(request(), fetcher as typeof fetch);
    expect(response.status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid identifiers and methods without contacting Jstris", async () => {
    const fetcher = vi.fn();
    expect((await fetchJstrisReplay(request("id=https://example.com&type=0"), fetcher as typeof fetch)).status).toBe(400);
    expect((await fetchJstrisReplay(request("id=92072007&type=2"), fetcher as typeof fetch)).status).toBe(400);
    expect((await fetchJstrisReplay(request("id=92072007&type=0", "POST"), fetcher as typeof fetch)).status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects malformed upstream responses", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("challenge", { status: 403 }))
      .mockResolvedValueOnce(new Response("<html>blocked</html>", { status: 200 }));
    const response = await fetchJstrisReplay(request(), fetcher as typeof fetch);
    expect(response.status).toBe(502);
  });

  it("stops reading and cancels an oversized body without Content-Length", async () => {
    let cancelled = false;
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(MAX_UPSTREAM_BYTES)); controller.enqueue(Uint8Array.of(1)); },
      cancel() { cancelled = true; },
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("warm", { status: 200 }))
      .mockResolvedValueOnce(new Response(oversized, { status: 200 }));
    const response = await fetchJstrisReplay(request(), fetcher as typeof fetch);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
  });

  it("enforces the streamed size when Content-Length understates the body", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("warm", { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(MAX_UPSTREAM_BYTES + 1), {
        status: 200,
        headers: { "Content-Length": "1" },
      }));
    expect((await fetchJstrisReplay(request(), fetcher as typeof fetch)).status).toBe(413);
  });

  it("maps a body stream failure to a gateway error", async () => {
    const broken = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(Uint8Array.of(123)); controller.error(new Error("stream failed")); },
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("warm", { status: 200 }))
      .mockResolvedValueOnce(new Response(broken, { status: 200 }));
    expect((await fetchJstrisReplay(request(), fetcher as typeof fetch)).status).toBe(502);
  });
});
